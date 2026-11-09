import conductor from './conductor';
import '../styl/app.styl';

conductor({
	defaultVotes: ['0', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '∞'],
	env: import.meta.env.MODE,
	firebase: {
		apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
		authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
		databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
		projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
		storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
		appId: import.meta.env.VITE_FIREBASE_APP_ID
	}
});
