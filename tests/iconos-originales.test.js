'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('iconos originales: sin máscaras ni ocultación de emojis y sin dependencias externas',()=>{const css=read('css/admin-elite.css');assert.doesNotMatch(css,/--elite-icon:url|font-size:\s*0\b|(?:-webkit-)?mask\s*:/);assert.match(css,/\.elite-config-icono\{[^}]*font-size:24px/);assert.match(css,/\.modulo-ico\{font-size:27px/);assert.match(css,/\.nav-btn \.ico\{font-size:23px/);});
test('iconos originales: se usan los mismos valores de configuración y navegación',()=>{const c=read('js/configuracion.js'),a=read('js/app.js');for(const s of ['🏪 Negocio','📍 Locales','👥 Usuarios','🔒 Seguridad','🔑 Licencia','📜 Bitácora'])assert.ok(c.includes(s));assert.ok(c.includes("UI.esc(p[1].split(' ')[0])"));assert.ok(a.includes('🍔'));assert.ok(a.includes('🛵'));assert.ok(a.includes('💵'));});
