import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const replacements = [
  ['unilever-travel-v1', 'teleperformance-travel-v1'],
  ['unilever-travel-theme', 'teleperformance-travel-theme'],
  ['unilever-tms-realtime', 'teleperformance-tms-realtime'],
  ['travel-demo-account', 'teleperformance-demo-account'],
  ['unilever-travel-ph.vercel.app', 'teleperformance-travel.vercel.app'],
  ['Unilever Philippines', 'Teleperformance'],
  ['UNILEVER PHILIPPINES', 'TELEPERFORMANCE'],
  ['Unilever', 'Teleperformance'],
  ['unilever-wordmark.svg', 'teleperformance-wordmark.svg'],
  ['unilever-1', 'teleperformance-1'],
  ['Better Journeys', 'TP Travel'],
  ['BETTER JOURNEYS', 'TP TRAVEL'],
  ['better journeys', 'business travel'],
  ['Better journeys. A brighter future.', 'Connected people. Exceptional journeys.'],
  ['UL-PH-', 'TP-PH-'],
  ['TMC-PH-001', 'TP-TMC-001'],
  ['ADMIN-PH-001', 'TP-ADMIN-001'],
  ['Andrea Santos', 'Alexandra Rivera'],
  ['Isabel Reyes', 'Gabriel Navarro'],
  ['Marco Villanueva', 'Rafael Castillo'],
  ['Elena Torres', 'Camille Bautista'],
  ['Miguel Cruz', 'Nico Salazar'],
  ['Sofia Lim', 'Alyssa Tan'],
  ['Paolo Garcia', 'Lucas Aquino'],
  ['Bea Mendoza', 'Chloe Ramos'],
];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (/\.(tsx?|css|html|sql|json|toml)$/.test(filename)) {
      let content = fs.readFileSync(filename, 'utf8');
      for (const [from, to] of replacements) content = content.replaceAll(from, to);
      fs.writeFileSync(filename, content);
    }
  }
}
for (const directory of ['src', 'supabase']) walk(path.join(root, directory));
let html = fs.readFileSync('index.html', 'utf8');
for (const [from, to] of replacements) html = html.replaceAll(from, to);
html = html.replace('<title>TP Travel | Corporate Travel</title>', '<title>TeleperformanceTravelManagementSystem</title>')
  .replaceAll('#102954', '#230D2E').replace('PHILIPPINES</span>', 'TRAVEL MANAGEMENT</span>')
  .replace(/\s*<link rel="icon" type="image\/png"[^>]+>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]+>/, '');
fs.writeFileSync('index.html', html);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.name = 'teleperformance-travel-management-system';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
lock.name = pkg.name; lock.packages[''].name = pkg.name;
fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');

const brand = 'public/brand';
fs.mkdirSync(brand, { recursive: true });
const assets = 'C:/Users/donro/Downloads/teleperformance';
const wordmark = fs.readFileSync(path.join(assets, 'logo with name of the brand.jpg'));
const symbol = fs.readFileSync(path.join(assets, 'logo tp.jpg'));
fs.copyFileSync(path.join(assets, 'logo with name of the brand.jpg'), `${brand}/teleperformance-logo-original.jpg`);
fs.copyFileSync(path.join(assets, 'logo tp.jpg'), `${brand}/teleperformance-symbol-original.jpg`);
fs.copyFileSync(path.join(assets, 'colorpalleteforTeleperformance.webp'), `${brand}/color-palette.webp`);
// SVG viewports display the supplied JPEGs without changing their pixels.
fs.writeFileSync(`${brand}/teleperformance-wordmark.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="52 252 765 147"><image width="866" height="650" href="data:image/jpeg;base64,${wordmark.toString('base64')}"/></svg>`);
fs.writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="930 280 910 950"><image width="2700" height="1414" href="data:image/jpeg;base64,${symbol.toString('base64')}"/></svg>`);
for (const file of ['public/favicon.png', 'public/apple-touch-icon.png', `${brand}/unilever-wordmark.svg`, 'public/images/unilever-family.jpg']) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
fs.writeFileSync(`${brand}/SOURCE.md`, '# Brand assets\n\nLogo and palette supplied by the user in Downloads/teleperformance. Original JPEGs are retained unchanged. SVG viewport wrappers remove surrounding white space for display.\n\nPalette: #000000, #230D2E, #742B8E, #E91E81, #F8F4FA.\n');

let seed = fs.readFileSync('src/db/seed.ts', 'utf8');
seed = seed.replace('Category Development Manager', 'Client Services Specialist')
  .replace("'Customer Development'", "'Client Experience'").replace("'Supply Chain'", "'Site Operations'")
  .replace("'Marketing'", "'Workforce Management'")
  .replace("'CD-PH-2026'", "'TP-CX-2026'").replaceAll('`UL${', '`TP${')
  .replace('Quarterly customer planning and retail execution review.', 'Quarterly client service delivery and account planning review.')
  .replace('Factory operations and supplier quality site assessment.', 'Contact center operations and service quality site assessment.')
  .replace('Regional brand strategy and capability development.', 'Regional workforce strategy and leadership capability development.');
fs.writeFileSync('src/db/seed.ts', seed);
fs.writeFileSync('src/components/layout/BrandWordmark.tsx', `export function BrandWordmark() {\n  return <span className="brand-wordmark"><img src="/brand/teleperformance-wordmark.svg" alt="Teleperformance" width="208" height="40"/><small>TRAVEL MANAGEMENT</small></span>;\n}\n`);
let theme = fs.readFileSync('src/lib/theme.ts', 'utf8').replaceAll('#14213d', '#230D2E');
fs.writeFileSync('src/lib/theme.ts', theme);
let auth = fs.readFileSync('src/features/auth/AuthScreen.tsx', 'utf8');
auth = auth.replace('<img className="auth-photo" src="/images/unilever-family.jpg" alt="A family enjoying a sunny day and blowing bubbles"/>', '<div className="tp-route-art" aria-hidden="true"><span className="tp-orbit tp-orbit-one"/><span className="tp-orbit tp-orbit-two"/><span className="tp-orbit tp-orbit-three"/><Plane size={76}/><b className="tp-route-origin">MNL</b><b className="tp-route-destination">Your next destination</b></div>')
  .replaceAll('PHILIPPINES', 'TRAVEL MANAGEMENT')
  .replace('Better journeys.<br/>A brighter future.', 'Connected people.<br/>Exceptional journeys.')
  .replace('Safe travels. Sustainable choices.<br/>Greater impact.', 'One workspace for every request,<br/>approval and business journey.')
  .replace('Making every journey matter.', 'People at the heart of every journey.')
  .replace('YOUR TRAVEL WORKSPACE', 'TELEPERFORMANCE TRAVEL')
  .replace('<div className="demo-account-grid">', '<div className="tp-demo-intro"><span className="tp-demo-badge">DEMO WORKSPACE</span><p>Choose an account to explore the complete travel workflow.</p><div className="demo-account-grid">')
  .replace('</span></button>)}</div>}', '</span><small>{({REQUESTOR:"Create and track requests",ADMIN:"Validate travel requests",MANAGER:"Approve travel budgets",TMC:"Ticket flights and reconcile"})[u.role]}</small></button>)}</div></div>}');
fs.writeFileSync('src/features/auth/AuthScreen.tsx', auth);
let welcome = fs.readFileSync('src/features/auth/LoginWelcome.tsx', 'utf8').replaceAll('PHILIPPINES', 'TRAVEL MANAGEMENT');
fs.writeFileSync('src/features/auth/LoginWelcome.tsx', welcome);
let sidebar = fs.readFileSync('src/components/layout/SidebarContent.tsx', 'utf8');
sidebar = sidebar.replace("import { BrandWordmark } from './BrandWordmark';", '')
  .replace(/<Link className="brand"[\s\S]*?<\/Link>/, '<Link className="brand tp-workspace-brand" to="/dashboard" aria-label="Teleperformance home" onClick={onNavigate}><span className="brand-symbol tp-rail-monogram" aria-hidden="true">TP</span><div className="sidebar-label brand-copy" aria-hidden={compact}><b>Travel workspace</b><small>{user.role === "REQUESTOR" ? "Employee" : user.role === "ADMIN" ? "Administration" : user.role === "MANAGER" ? "Management" : "Travel desk"}</small></div></Link>')
  .replace('CORPORATE TRAVEL</div>', 'YOUR WORKSPACE</div>')
  .replace('Small choices.<br/>Greater impact.', 'Every journey.<br/>A human connection.')
  .replace('Every journey is a chance to<br/>travel more sustainably.', 'Plan thoughtfully. Choose a<br/>lower-impact flight when you can.');
fs.writeFileSync('src/components/layout/SidebarContent.tsx', sidebar);
console.log('Teleperformance branding and independent demo identities applied.');
