import Diff from 'text-diff';
import findIndex from 'lodash/findIndex';
import isEqual from 'lodash/isEqual';

// merge text conflicts
export default (base, a, b) => {
	const diff = new Diff();

	// generate diffs
	const bFromBase = diff.main(base, b);
	const aFromB = diff.main(b, a);

	// cleanup diffs
	diff.cleanupEfficiency(bFromBase);
	diff.cleanupEfficiency(aFromB);

	// invert b changes to use as filter
	const inverted = bFromBase.filter(change => change[0] !== 0).map(change => [change[0]*-1, change[1]]);

	// remove a changes that undo b changes, and join remaining
	return aFromB.filter(change => {
		let i = findIndex(inverted, val => isEqual(change, val));
		if(i > -1) {
			inverted.splice(i,1);
			return false;
		}
		return true;
	}).filter(change => change[0] !== -1)
		.reduce((result, change) => result + change[1], '');
};
