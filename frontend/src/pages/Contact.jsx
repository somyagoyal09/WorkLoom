import { Link } from 'react-router-dom';

export default function Contact() {
  return (
    <div className="wl-contact-page">
      <header className="wl-site-nav">
        <Link to="/" className="wl-site-brand"><img src="/logo-mark.png" alt="Workloom" className="wl-site-logo-mark" /><span className="wl-brand-copy"><small>JEWELLERY WORKFLOWS, WOVEN BETTER</small><strong>WORKLOOM</strong></span></Link>
        <Link to="/" className="wl-text-link">← Back to Workloom</Link>
      </header>
      <main className="wl-contact-main">
        <div className="wl-section-number">CONTACT / WORKLOOM</div>
        <div className="wl-contact-grid">
          <div><h1>Tell us about your <em>workshop.</em></h1><p>Workloom is being built around real jewellery production workflows. If you would like to know more or discuss the product, get in touch directly.</p></div>
          <div className="wl-contact-form">
            <div className="wl-contact-detail"><span>EMAIL</span><a href="mailto:workloom.contact@gmail.com">workloom.contact@gmail.com</a></div>
            <div className="wl-contact-detail"><span>PHONE</span><a href="tel:+919368807972">+91 93688 07972</a></div>
            <div className="wl-contact-actions">
              <a href="mailto:workloom.contact@gmail.com" className="wl-pill wl-pill-dark">Email us <i className="bi bi-envelope" /></a>
              <a href="tel:+919368807972" className="wl-pill wl-pill-dark">Call us <i className="bi bi-telephone" /></a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
