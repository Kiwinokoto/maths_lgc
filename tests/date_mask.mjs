import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const start = source.indexOf('function birthDateToFrench');
const end = source.indexOf('async function syncProgress', start);
assert.ok(start >= 0 && end > start, 'date helpers not found in app.js');

const helpers = new Function(
  source.slice(start, end) +
  '\nreturn { birthDateToFrench, formatBirthDateInput, frenchBirthDateToIso };'
)();

assert.equal(helpers.formatBirthDateInput('0'), '0');
assert.equal(helpers.formatBirthDateInput('04'), '04');
assert.equal(helpers.formatBirthDateInput('040'), '04/0');
assert.equal(helpers.formatBirthDateInput('0409'), '04/09');
assert.equal(helpers.formatBirthDateInput('04091'), '04/09/1');
assert.equal(helpers.formatBirthDateInput('04 09 1981'), '04/09/1981');
assert.equal(helpers.formatBirthDateInput('04/09/1981'), '04/09/1981');
assert.equal(helpers.formatBirthDateInput('040919811234'), '04/09/1981');

assert.equal(helpers.frenchBirthDateToIso('04/09/1981'), '1981-09-04');
assert.equal(helpers.birthDateToFrench('1981-09-04'), '04/09/1981');
assert.equal(helpers.frenchBirthDateToIso('29/02/2000'), '2000-02-29');
assert.equal(helpers.frenchBirthDateToIso('29/02/2001'), '');
assert.equal(helpers.frenchBirthDateToIso('31/04/2008'), '');
assert.equal(helpers.frenchBirthDateToIso('32/01/2008'), '');
assert.equal(helpers.frenchBirthDateToIso('04/13/1981'), '');
assert.equal(helpers.frenchBirthDateToIso('4/9/1981'), '');

console.log('birth date mask test: OK');
