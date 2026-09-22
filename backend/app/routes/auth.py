from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from app.auth import create_token, verify_password, hash_password, users_collection, get_current_user
from app.database import db
router=APIRouter()
class LoginRequest(BaseModel):
    phone: str = Field(..., min_length=5, max_length=20)
    password: str = Field(..., min_length=4, max_length=128)
    role: str = Field(..., pattern='^(owner|karigar)$')
    workshop_code: str | None = Field(default=None, min_length=3, max_length=30)
class UserResponse(BaseModel):
    user_id:str; name:str; role:str; workshop:str; workshop_id:str|None=None; initials:str; specialty:str|None=None
class RegisterOwnerRequest(BaseModel):
    name:str=Field(...,min_length=2,max_length=80); workshop:str=Field(...,min_length=2,max_length=100); phone:str=Field(...,min_length=5,max_length=20); password:str=Field(...,min_length=6,max_length=128)
class LoginResponse(BaseModel):
    access_token:str; token_type:str='bearer'; user:UserResponse
def _normal_phone(value):
    p=''.join(ch for ch in value if ch.isdigit())
    if p.startswith('91') and len(p)==12:p=p[-10:]
    elif p.startswith('0') and len(p)==11:p=p[-10:]
    return p
def _public_user(u):
    return {'user_id':u['user_id'],'name':u['name'],'role':u['role'],'workshop':u.get('workshop',''),'workshop_id':u.get('workshop_id'),'initials':u.get('initials','WL'),'specialty':u.get('specialty')}
def _require_workspace(u):
    wid=u.get('workshop_id')
    if not wid: raise HTTPException(status_code=403,detail='This account is not linked to a workspace.')
    if not db['workshops'].find_one({'workshop_id':wid,'is_active':True}): raise HTTPException(status_code=403,detail='Your workspace is unavailable. Ask the workspace owner to check it.')
@router.post('/login', response_model=LoginResponse)
def login(payload: LoginRequest):
    phone = _normal_phone(payload.phone)
    if len(phone) != 10:
        raise HTTPException(status_code=400, detail='Enter a valid 10-digit phone number.')

    workshop = None
    if payload.role == 'karigar':
        code = ''.join(ch for ch in (payload.workshop_code or '').upper() if ch.isalnum() or ch == '-')
        if not code:
            raise HTTPException(status_code=400, detail='Enter your workshop code.')
        workshop = db['workshops'].find_one({'code': code, 'is_active': True})
        if not workshop:
            raise HTTPException(status_code=404, detail='Workshop code not found. Ask the owner for the correct code.')
        # Accept legacy Karigar records that may have stored a country code
        # (91XXXXXXXXXX) while new records are normalized to 10 digits.
        user = users_collection.find_one({
            'phone': {'$in': [phone, f'91{phone}']},
            'workshop_id': workshop['workshop_id'],
            'role': 'karigar',
            'is_active': True,
        })
    else:
        user = users_collection.find_one({'phone': phone, 'role': 'owner', 'is_active': True})

    if not user or not verify_password(payload.password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail='Incorrect workshop code, phone number or PIN.')
    if user.get('role') != payload.role:
        expected = 'Owner' if user.get('role') == 'owner' else 'Karigar'
        raise HTTPException(status_code=403, detail=f'This phone number belongs to a {expected} account. Select {expected} to continue.')
    _require_workspace(user)
    users_collection.update_one({'_id': user['_id']}, {'$set': {'last_login_at': datetime.now(timezone.utc)}})
    return {'access_token': create_token(user), 'user': _public_user(user)}

@router.get('/me',response_model=UserResponse)
def me(user:dict=Depends(get_current_user)):
    _require_workspace(user); return _public_user(user)
@router.post('/register-owner',response_model=LoginResponse,status_code=201)
def register_owner(payload:RegisterOwnerRequest):
    phone=_normal_phone(payload.phone); name=' '.join(payload.name.split()); workshop=' '.join(payload.workshop.split())
    if len(phone)!=10: raise HTTPException(status_code=400,detail='Enter a valid 10-digit phone number.')
    if users_collection.find_one({'phone':phone}): raise HTTPException(status_code=409,detail='An account already exists for this phone number. Sign in instead.')
    wid=f'WORKSHOP-{uuid4().hex[:12].upper()}'; wcode=f'WL-{uuid4().hex[:6].upper()}'; uid=f'USR-OWNER-{uuid4().hex[:12].upper()}'; now=datetime.now(timezone.utc); initials=''.join(x[0] for x in name.split()[:2]).upper() or 'WL'
    user={'user_id':uid,'phone':phone,'name':name,'role':'owner','workshop':workshop,'workshop_id':wid,'initials':initials,'specialty':None,'password_hash':hash_password(payload.password),'is_active':True,'created_at':now}
    try:
        users_collection.insert_one(user); db['workshops'].insert_one({'workshop_id':wid,'name':workshop,'code':wcode,'owner_user_id':uid,'created_at':now,'is_active':True})
    except Exception as exc:
        users_collection.delete_one({'user_id':uid}); db['workshops'].delete_one({'workshop_id':wid}); raise HTTPException(status_code=500,detail='Could not create the workspace. Please try again.') from exc
    return {'access_token':create_token(user),'user':_public_user(user)}
