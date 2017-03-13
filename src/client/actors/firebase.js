// import lodash functions
import isArray from 'lodash/isArray';
import isBoolean from 'lodash/isBoolean';
import isEqual from 'lodash/isEqual';
import isNull from 'lodash/isNull';
import isObject from 'lodash/isObject';
import isString from 'lodash/isString';

// other imports
import arrayFlatMap from '../lib/arrayFlatMap';
import event$ from '../lib/event$';
import Kefir from 'kefir';

// init Firebase library
import 'firebase/auth';
import 'firebase/database';
import Firebase from 'firebase/app';

// create an event stream from a Firebase Snapshot
const snapToEvent$ = stream => stream.map(snap => ({ [`change:${snap.key}`]: snap.val() })).skipDuplicates(isEqual);

// actor function export
export default changes => {
	let roomRef, userRef, refs = [];

	// init Firebase
	const app$ = event$(changes, 'firebase')
		.filter(isObject)
		.map(config => Firebase.initializeApp(config))
		.filter();

	// init auth
	const auth$ = app$.map(app => app.auth());
	const authUser$ = auth$.flatMap(auth => Kefir.stream(e => auth.onAuthStateChanged(e.emit)));

	// sign in user if they aren't
	auth$.sampledBy(authUser$.filter(isNull))
		.onValue(auth => auth.signInAnonymously());

	// init updates
	event$(changes, 'show_votes').filter(isBoolean).onValue(show_votes => roomRef && roomRef.update({show_votes}));
	event$(changes, 'topic').filter(isString).onValue(topic => roomRef && roomRef.update({topic}));
	event$(changes, 'users').filter(isObject).onValue(users => roomRef && roomRef.update({users}));
	event$(changes, 'votes').filter(isArray).onValue(votes => roomRef && roomRef.update({votes}));
	event$(changes, 'vote').filter(isString).onValue(vote => userRef && userRef.update({vote}));

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
				room.child('users'),
				room.child('topic')
			];

			// return new streams
			return snapToEvent$(arrayFlatMap(refs, ref => Kefir.fromEvents(ref, 'value')));
		});
};
