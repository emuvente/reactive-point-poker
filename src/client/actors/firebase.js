// import lodash functions
import isArray from 'lodash/isArray';
import isBoolean from 'lodash/isBoolean';
import isEqual from 'lodash/isEqual';
import isNull from 'lodash/isNull';
import isObject from 'lodash/isObject';
import isString from 'lodash/isString';
import findIndex from 'lodash/findIndex';

// other imports
import arrayFlatMap from '../lib/arrayFlatMap';
import event$ from '../lib/event$';
import Kefir from 'kefir';
import Diff from 'text-diff';

// init Firebase library
import 'firebase/auth';
import 'firebase/database';
import Firebase from 'firebase/app';

// create an event stream from a Firebase Snapshot
const snapToEvent$ = stream => stream.map(snap => ({ [`change:${snap.key}`]: snap.val() })).skipDuplicates(isEqual);

// actor function export
export default changes => {
	let roomRef, userRef, refs = [];
	const diff = new Diff();

	// init Firebase
	const app$ = event$(changes, 'firebase')
		.filter(isObject)
		.map(config => Firebase.initializeApp(config))
		.filter();

	// init auth
	const auth$ = app$.map(app => app.auth());
	const authUser$ = auth$.flatMap(auth => Kefir.stream(e => auth.onAuthStateChanged(e.emit)));

	// sign in user if they aren't
	auth$.sampledBy(authUser$.filter(isNull)).observe(auth => auth.signInAnonymously());

	// init updates
	event$(changes, 'show_votes').filter(isBoolean).observe(show_votes => roomRef && roomRef.update({show_votes}));
	event$(changes, 'users').filter(isObject).observe(users => roomRef && roomRef.update({users}));
	event$(changes, 'votes').filter(isArray).observe(votes => roomRef && roomRef.update({votes}));
	event$(changes, 'vote').filter(isString).observe(vote => userRef && userRef.update({vote}));

	// init room
	const room$ = app$.map(app => app.database().ref())
		.combine(event$(changes, 'room').filter().skipDuplicates(),
			(db, roomName) => db.child(roomName)
		).filter();

	// init user
	const user$ = Kefir.combine([room$, authUser$.filter().map(v => v.uid)], (room, userId) => room.child(`users/${userId}`));

	// handle special user name case
	Kefir.combine([user$.filter(), event$(changes, 'name').filter(isString)]).onValue(([user, name]) => user.update({name}));

	return Kefir.combine([room$, user$])
		.flatMap(([room, user]) => {
			// drop references to old room and update room reference
			if(roomRef) roomRef.off();
			roomRef = room;

			// remove user from old room and update user reference
			if(userRef) userRef.remove();
			userRef = user;
			user.onDisconnect().remove();

			// drop old references
			refs.map(ref => ref.off());

			// make new references
			refs = [
				room.child('show_votes'),
				room.child('votes'),
				user.child('vote'),
				room.child('users')
			];

			Kefir.combine([
				event$(changes, 'topic'),
				Kefir.fromEvents(room.child('topic'), 'value')
					.map(snap => snap.val())
					.map(val => val.split(':'))
					.map(([, ...topics]) => topics.join(':')),
			]).sampledBy(event$(changes, 'topic').filter(isString))
				.observe(([value, local]) => room.child('topic').transaction(remote => {
					// generate diffs
					const remoteFromLocal = diff.main(local, remote);
					const valueFromRemote = diff.main(remote, value);

					// invert remote changes to use as filter
					const inverted = remoteFromLocal.filter(change => change[0] !== 0).map(change => (change[0]*=-1,change));

					// remove changes that undo remote changes, and join remaining
					return valueFromRemote.filter(change => {
						let i = findIndex(inverted, val => isEqual(change, val));
						if(i > -1) {
							inverted.splice(i,1);
							return false;
						}
						return true;
					}).filter(change => change[0] !== -1)
						.reduce((result, change) => result + change[1], `${user.key}:`);
				}));

			const topic$ = Kefir.fromEvents(room.child('topic'), 'value')
				.map(snap => snap.val())
				.map(val => val.split(':'))
				.map(([uid, ...topics]) => ({uid, value:topics.join(':')}));

			// return new streams
			return Kefir.merge([
				snapToEvent$(arrayFlatMap(refs, ref => Kefir.fromEvents(ref, 'value'))),
				topic$.filter(topic => topic.uid !== user.key).map(topic => ({'change:topic': topic.value})),
				topic$.filter(topic => topic.uid === user.key).map(topic => ({'report:topic': topic.value}))
			]);
		});
};
