import { useState } from 'react';
import { Link } from 'react-router-dom';
import heroImage from '../assets/jewelry-hero.png';

const workflow = [
  ['01', 'Capture', 'Voice, message, or a design reference.'],
  ['02', 'Understand', 'Turn a rough request into a clear job.'],
  ['03', 'Design', 'WorkLoom AI, Pinterest, Draw, Camera or Upload.'],
  ['04', 'Produce', 'Assign the job and move it through production stages.'],
  ['05', 'Check', 'Review the piece before dispatch.'],
  ['06', 'Remember', 'Keep the job history together.'],
];

export default function Landing() {
  const [showFlow, setShowFlow] = useState(false);
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="wl-site">
      <header className="wl-site-nav">
        <Link to="/" className="wl-site-brand">
          <img src="/logo-mark.png" alt="Workloom" className="wl-site-logo-mark" />
          <span className="wl-brand-copy"><small>JEWELLERY WORKFLOWS, WOVEN BETTER</small><strong>WORKLOOM</strong></span>
        </Link>
        <nav className="wl-site-links">
          <button onClick={() => scrollTo('idea')}>The idea</button>
          <button onClick={() => scrollTo('workflow')}>Workflow</button>
          <button onClick={() => scrollTo('intelligence')}>Intelligence</button>
          <Link to="/contact">Contact</Link>
        </nav>
        <div className="wl-site-actions">
          <button
            type="button"
            className="wl-flow-trigger"
            onClick={() => setShowFlow(true)}
            aria-label="How WorkLoom works"
            title="How WorkLoom works"
          >
            <i className="bi bi-diagram-3" aria-hidden="true" />
          </button>
          <Link to="/login" className="wl-text-link">Sign in</Link>
          <Link to="/register-owner" className="wl-pill wl-pill-dark">Start workspace <i className="bi bi-arrow-up-right" /></Link>
        </div>
      </header>

      <main>
        <section className="wl-hero-new" style={{ '--wl-hero-image': `url(${heroImage})` }}>
          <div className="wl-hero-new-overlay" />
          <div className="wl-hero-new-content">
            <div className="wl-kicker light"><span /> AI-ASSISTED JEWELLERY WORKSHOP OPERATIONS</div>
            <h1>From the customer's <em>idea</em> to a finished piece.</h1>
            <p>Workloom keeps the request, design, instructions and production trail connected — as one living job.</p>
            <div className="wl-hero-buttons">
              <Link to="/register-owner" className="wl-pill wl-pill-light">Start workspace <i className="bi bi-arrow-up-right" /></Link>
              <button className="wl-hero-link" onClick={() => scrollTo('workflow')}>Explore the workflow <i className="bi bi-arrow-down" /></button>
            </div>
          </div>
          <div className="wl-hero-caption">ONE JOB · ONE IDENTITY · EVERY HANDOFF</div>
        </section>

        <section id="idea" className="wl-editorial wl-idea">
          <div className="wl-section-number">01 / THE IDEA</div>
          <div className="wl-editorial-grid">
            <h2>A jewellery job should never <em>disappear.</em></h2>
            <div className="wl-editorial-copy">
              <p>Real workshop work rarely begins with a perfect form. It begins with a conversation, a WhatsApp reference, a sketch, an existing ring or a quick instruction.</p>
              <p>Workloom gives that beginning a memory — then carries the same job through design, assignment, production and QC.</p>
              <span className="wl-rule-label">BUILT AROUND THE WORKSHOP · NOT A GENERIC ERP</span>
            </div>
          </div>
        </section>

        <section id="workflow" className="wl-workflow-new">
          <div className="wl-section-number">02 / THE WORKFLOW</div>
          <div className="wl-section-intro-row wl-reverse-row">
            <p>From the first request to final QC, the same job stays connected.</p>
            <h2>One job.<br /><em>Every handoff.</em></h2>
          </div>
          <div className="wl-workflow-line">
            {workflow.map(([num, title, text], index) => (
              <article className="wl-workflow-item" key={num}>
                <span className="wl-workflow-num">{num}</span>
                <span className="wl-workflow-icon"><i className={`bi ${['bi-chat-square-text','bi-stars','bi-gem','bi-hammer','bi-check2-circle','bi-box'][index]}`} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="intelligence" className="wl-intelligence-new wl-intelligence-editorial">
          <div className="wl-section-number">03 / THE INTELLIGENCE LAYER</div>
          <div className="wl-intelligence-layout">
            <h2>AI where the workshop <em>actually needs it.</em></h2>
            <div className="wl-intelligence-content">
              <p className="wl-intelligence-lead">AI where the workshop needs it — for messy inputs, visual context and design exploration, with the owner always in control.</p>
              <p><strong>Voice → structured job.</strong> Turn natural conversations into clear production requirements.</p>
              <p><strong>Reference → understanding.</strong> Keep visual context attached to the job before work begins.</p>
              <p><strong>Idea → design direction.</strong> Explore concepts while the owner reviews before production.</p>
            </div>
          </div>
        </section>

        <section className="wl-product-new">
          <div className="wl-section-number">04 / INSIDE THE WORKSHOP</div>
          <div className="wl-section-intro-row">
            <h2>The job stays alive <em>after the customer leaves.</em></h2>
            <p>Assignment, production stages, QC, messages and history stay connected to the same job.</p>
          </div>
        </section>

        <section className="wl-focus-new">
          <div className="wl-section-number">05 / WHAT WORKLOOM FOCUSES ON</div>
          <div className="wl-focus-grid">
            <div><strong>Voice → Job</strong><p>Turn natural customer conversations into clear production requirements.</p></div>
            <div><strong>Design References</strong><p>Use WorkLoom AI, Pinterest, Draw, Camera or Upload.</p></div>
            <div><strong>Owner ↔ Karigar</strong><p>Assign work, answer questions and keep the handoff clear.</p></div>
            <div><strong>Workshop Tracking</strong><p>See active work, due jobs, progress and production movement.</p></div>
          </div>
        </section>

        <section className="wl-contact-strip">
          <div>
            <div className="wl-section-number light">06 / CONTACT</div>
            <h2>Let's build a better <em>workshop memory.</em></h2>
            <p>Want a better way to run your workshop? Get in touch with Workloom.</p>
          </div>
          <div className="wl-hero-buttons">
            <a href="mailto:workloom.contact@gmail.com" className="wl-pill wl-pill-light">Email us <i className="bi bi-envelope" /></a>
            <a href="tel:+919368807972" className="wl-pill wl-pill-light">Call us <i className="bi bi-telephone" /></a>
          </div>
        </section>
      </main>

      {showFlow && (
        <div className="wl-flow-overlay" role="dialog" aria-modal="true" aria-labelledby="wl-flow-title" onClick={() => setShowFlow(false)}>
          <div className="wl-flow-modal" onClick={(event) => event.stopPropagation()}>
            <div className="wl-flow-modal-head">
              <div>
                <div className="wl-section-number">HOW WORKLOOM WORKS</div>
                <h2 id="wl-flow-title">One job. Every handoff.</h2>
                <p>From the customer’s idea to production and QC, the same job stays connected.</p>
              </div>
              <button type="button" className="wl-flow-close" onClick={() => setShowFlow(false)} aria-label="Close workflow map">
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>

            <div className="wl-flow-map">
              <div className="wl-flow-node"><span>01</span><i className="bi bi-chat-square-text" /><strong>Capture</strong><small>Voice · message · reference</small></div>
              <i className="bi bi-arrow-right wl-flow-arrow" aria-hidden="true" />
              <div className="wl-flow-node"><span>02</span><i className="bi bi-stars" /><strong>Understand</strong><small>AI → structured job</small></div>
              <i className="bi bi-arrow-right wl-flow-arrow" aria-hidden="true" />
              <div className="wl-flow-node"><span>03</span><i className="bi bi-gem" /><strong>Design</strong><small>AI · Pinterest · Draw · Camera · Upload</small></div>
              <i className="bi bi-arrow-right wl-flow-arrow" aria-hidden="true" />
              <div className="wl-flow-node"><span>04</span><i className="bi bi-check2-circle" /><strong>Review</strong><small>Owner verifies the job</small></div>
            </div>

            <div className="wl-flow-branch">
              <div className="wl-flow-branch-main">
                <div className="wl-flow-node"><span>05</span><i className="bi bi-person-badge" /><strong>Assign</strong><small>Owner → specific Karigar</small></div>
                <i className="bi bi-arrow-down wl-flow-arrow" aria-hidden="true" />
                <div className="wl-flow-node"><span>06</span><i className="bi bi-hammer" /><strong>Produce</strong><small>Stages · updates · references</small></div>
                <i className="bi bi-arrow-down wl-flow-arrow" aria-hidden="true" />
                <div className="wl-flow-node"><span>07</span><i className="bi bi-shield-check" /><strong>Check</strong><small>QC before dispatch</small></div>
              </div>
              <div className="wl-flow-side">
                <div className="wl-flow-side-line"><i className="bi bi-question-circle" /><strong>Karigar has a doubt</strong></div>
                <i className="bi bi-arrow-down wl-flow-arrow" aria-hidden="true" />
                <div className="wl-flow-side-line"><i className="bi bi-bell" /><strong>Ask owner → notification</strong></div>
                <small>Customer phone remains private on the Karigar side.</small>
              </div>
            </div>

            <div className="wl-flow-footer">
              <span><i className="bi bi-clock-history" /> Full order history stays with the job.</span>
              <span><i className="bi bi-kanban" /> Owner tracks progress across the workshop.</span>
            </div>
          </div>
        </div>
      )}

      <footer className="wl-site-footer">
        <Link to="/" className="wl-site-brand"><img src="/logo-mark.png" alt="Workloom" className="wl-site-logo-mark" /><span className="wl-brand-copy"><small>JEWELLERY WORKFLOWS, WOVEN BETTER</small><strong>WORKLOOM</strong></span></Link>
        <span>AI-assisted jewellery workshop operations</span>
        <span>© 2026 Workloom</span>
      </footer>
    </div>
  );
}
