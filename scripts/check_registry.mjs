import { ADMIN_GROUPS, visibleGroups } from '../frontend/src/modules/registry.js';

let errors = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    errors++;
  } else {
    console.log(`PASS: ${message}`);
  }
}

console.log('=== Checking Admin Navigation Registry ===');

// 1. Check unique icons across all modules
const allIcons = [];
for (const group of ADMIN_GROUPS) {
  for (const item of group.items) {
    if (allIcons.includes(item.icon)) {
      assert(false, `Icon '${item.icon}' reused on item '${item.id}'`);
    } else {
      allIcons.push(item.icon);
    }
  }
}
assert(allIcons.length === 12, `Expected 12 unique icons, found ${allIcons.length}`);

// 2. Admin sees every group
const adminGroups = visibleGroups(() => true, () => true, {});
assert(adminGroups.length === ADMIN_GROUPS.length, `Admin sees all ${ADMIN_GROUPS.length} groups`);
assert(adminGroups.every((g) => g.items.length > 0), 'No group is empty for admin');

// 3. Custom role with only 'team.view'
const teamOnlyCan = (p) => p === 'team.view';
const teamOnlyCanAny = (perms) => perms.includes('team.view');
const teamOnlyGroups = visibleGroups(teamOnlyCan, teamOnlyCanAny, {});

// Expect overview (no requires), people (teams), and eventday (qrScan)
const groupIds = teamOnlyGroups.map((g) => g.id);
assert(groupIds.includes('people'), "Role with team.view sees 'people' group");
const peopleGroup = teamOnlyGroups.find((g) => g.id === 'people');
assert(
  peopleGroup && peopleGroup.items.length === 1 && peopleGroup.items[0].id === 'teams',
  "People group contains Teams only for team.view role"
);
assert(!groupIds.includes('judging'), "Judging group dropped when no permissions match");
assert(!groupIds.includes('communicate'), "Communicate group dropped when no permissions match");
assert(!groupIds.includes('settings'), "Settings group dropped when no permissions match");

// 4. Feature flag pods === false hides pods
const withPods = visibleGroups(() => true, () => true, { pods: true });
const withoutPods = visibleGroups(() => true, () => true, { pods: false });

const dayWithPods = withPods.find((g) => g.id === 'eventday');
const dayWithoutPods = withoutPods.find((g) => g.id === 'eventday');

assert(dayWithPods.items.some((i) => i.id === 'pods'), "Pods item visible when pods: true");
assert(!dayWithoutPods.items.some((i) => i.id === 'pods'), "Pods item hidden when pods: false");

// 5. Feature flag evaluation === false hides rounds and drops judging group if rounds is the only item
const withoutEval = visibleGroups(() => true, () => true, { evaluation: false });
assert(!withoutEval.some((g) => g.id === 'judging'), "Judging group dropped when evaluation: false");

// 6. Verification: no group appears empty under any scenario
for (const g of teamOnlyGroups) {
  assert(g.items && g.items.length > 0, `Group ${g.id} has items`);
}
for (const g of withoutPods) {
  assert(g.items && g.items.length > 0, `Group ${g.id} has items`);
}
for (const g of withoutEval) {
  assert(g.items && g.items.length > 0, `Group ${g.id} has items`);
}

if (errors > 0) {
  console.error(`\nCheck failed with ${errors} errors.`);
  process.exit(1);
} else {
  console.log('\nAll registry checks passed successfully!');
  process.exit(0);
}
