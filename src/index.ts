import { format as formatDate } from 'date-fns';
import { diff, formatters } from 'jsondiffpatch';
import { addPlugin, Flipper } from 'react-native-flipper';

export type Configuration = {
	resolveCyclic?: boolean;
	actionsBlacklist?: Array<string>;
	stateWhitelist?: string[];
};

let currentConnection: Flipper.FlipperConnection | null = null;

const error = {
	NO_STORE: 'NO_STORE',
};

const createInitialAction = (store: any) => {
	const startTime = Date.now();
	const initState = store.getState();

	const state = {
		id: startTime,
		time: formatDate(startTime, 'HH:mm:ss.SSS'),
		action: { type: '@@INIT' },
		state: initState,
	};

	currentConnection?.send('initStore', state);
};

const createDebugger = () => (store: any) => {
	if (currentConnection === null) {
		addPlugin({
			getId() {
				return 'flipper-plugin-redux-observer';
			},
			onConnect(connection: any) {
				currentConnection = connection;

				currentConnection?.receive('dispatchAction', (data: any, responder: any) => {
					if (store) {
						store.dispatch({ type: data.type, ...data.payload });

						responder.success({
							ack: true,
						});
					} else {
						responder.success({
							error: error.NO_STORE,
							message: 'store is not setup in flipper plugin',
						});
					}
				});

				createInitialAction(store);
			},
			onDisconnect() {
				currentConnection = null;
			},
			runInBackground() {
				return true;
			},
		});
	} else {
		createInitialAction(store);
	}

	return (next: any) => (action: { type: string }) => {
		const startTime = Date.now();
		const beforeState = store.getState();
		const result = next(action);
		if (currentConnection) {
			const afterState = store.getState();
			const now = Date.now();
			const delta = diff(beforeState, afterState);
            // @ts-ignore
			const deltaJSONPatch = formatters.jsonpatch.format(delta || {}, beforeState);
			const newActionEvent = {
				id: startTime,
				time: formatDate(now, 'HH:mm:ss.SSS'),
				duration: `${now - startTime} ms`,
				action: action,
				diff: JSON.stringify(deltaJSONPatch),
			};

			currentConnection.send('newAction', newActionEvent);
		}

		return result;
	};
};

export default createDebugger;
