const {"v4": getGuid} = require('uuid');
const axios = require('axios');
const {WebSocket} = require("ws");

const CONNECTION_ERROR_CODES = ["ECONNABORTED", "ECONNRESET", "ETIMEDOUT"];

class TotallyFrozenObject {
    constructor(objectForFreeze) {
        return new Proxy(Object.freeze(objectForFreeze), {
            get (target, property) {
                if (property in target) {
                    return target[property];
                } else {
                    throw new ReferenceError(property + " is not defined");
                }
            }
        });
    }
}

class AuthError extends Error {
	constructor(message) {
		// Pass remaining arguments (including vendor specific ones) to parent constructor
		super(message);
		Object.defineProperty(this, 'name', {
			enumerable: false,
			configurable: false,
			writable: true,
			value: this.constructor.name
		});
		Error.captureStackTrace(this, this.constructor);
	}
}

async function globalCreateObject({appUrl, userCookie, newObjectData}) {
	if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!newObjectData) {
		throw new Error("newObjectData is not defined");
	} else if (!newObjectData.entityId) {
		throw new Error("newObjectData.entityId is not defined");
	}

	let newObjId = getGuid();
	await globalSaveObject({
		"appUrl": appUrl,
		"userCookie": userCookie,
		"objectId": newObjId,
		"objectData": newObjectData
	});
	return newObjId;
}

async function globalSaveObject({appUrl, userCookie, objectId, objectData}) {
	if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!objectId) {
		throw new Error("objectId is not defined");
	} else if (!objectData) {
		throw new Error("objectData is not defined");
	} else if (!objectData.entityId) {
		throw new Error("objectData.entityId is not defined");
	}

	await axios.post(appUrl + `rest/data/entity/` + objectId, objectData, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//30 seconds
		timeout: 30000
	});
}

async function globalDeleteObjects({appUrl, userCookie, deleteObjectIds}) {
	if (!Array.isArray(deleteObjectIds)) {
		throw new Error("deleteObjectIds is not Array");
	}

	await axios.post(appUrl + `rest/data/deleteentity`, {
		"objectIds": deleteObjectIds
	}, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//10 minutes
		timeout: 600000
	});
}

async function globalGetObject({appUrl, userCookie, objectId, attributesToGet}) {
	if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!objectId) {
		throw new Error("objectId is not defined");
	} else if (attributesToGet && !Array.isArray(attributesToGet)) {
		throw new Error("attributesToGet is not array");
	}

	let requestURL = appUrl + `rest/data/entity/` + objectId;
	if (attributesToGet && attributesToGet.length > 0) {
		requestURL += "?attributes=" + attributesToGet.join(",");
	}

	let response = await axios.get(requestURL, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//60 seconds
		timeout: 60000
	});

	return response.data;
}

async function globalGetObjects({appUrl, userCookie, searchParameters}) {
	if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!searchParameters) {
		throw new Error("searchParameters is not defined");
	} else if (!searchParameters.entityId) {
		throw new Error("searchParameters.entityId is not defined");
	} else if (searchParameters.attributes && !Array.isArray(searchParameters.attributes)) {
		throw new Error("searchParameters.attributes is not Array");
	} else if (!searchParameters.limit) {
		throw new Error("searchParameters.limit is not defined");
	} else if (typeof searchParameters.sortAsc !== "undefined") {
		if (typeof searchParameters.sortAsc !== "boolean") {
			throw new Error("type of searchParameters.sortAsc is not boolean");
		}
	}

	let searchObject = {};
	searchObject.entityId = searchParameters.entityId;
	searchObject.limit = searchParameters.limit;
	if (searchParameters.attributes) {
		searchObject.attributes = searchParameters.attributes;
	} else {
		searchObject.attributes = [];
	}
	if (searchParameters.dataCondition) {
		searchObject.useCondition = true;
		searchObject.dataCondition = searchParameters.dataCondition;
	} else {
		searchObject.useCondition = false;
	}
	if (searchParameters.DBSearch === true) {
		searchObject.bindType = "UML";
	} else {
		searchObject.bindType = "entity";
	}
	if (searchParameters.sort) {
		searchObject.sort = searchParameters.sort;
		searchObject.sortAsc = searchParameters.sortAsc || false;
	}
	
	let searchResult = await axios.post(appUrl + `rest/data/entity/`, searchObject, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//60 seconds
		timeout: 60000
	});
	return searchResult.data;
}

async function globalGetForms({appUrl, userCookie}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	}

	const {"data":{forms}} = await axios.get(appUrl + `rest/forms`, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//60 seconds
		timeout: 60000
	});
	return forms;
}

async function globalGetVises({appUrl, userCookie}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	}

	const {"data":vises} = await axios.get(appUrl + `rest/vis`, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//30 seconds
		timeout: 30000
	});
	return vises;
}

async function globalGetWorkflows({appUrl, userCookie}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	}

	const {"data":{workflows}} = await axios.get(appUrl + `rest/workflow`, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//30 seconds
		timeout: 30000
	});
	return workflows;
}

async function globalGetUMLSchema({appUrl, userCookie}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	}

	const {"data": UMLSchema} = await axios.get(appUrl + `rest/entityspec`, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//5 minutes
		timeout: 300000
	});
	return UMLSchema;
}

async function globalGetFormData({appUrl, userCookie, formObjectId}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!formObjectId) {
		throw new Error("formObjectId is not defined");
	}

	const {"data": formData} = await axios.get(appUrl + `rest/form/` + formObjectId, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//30 seconds
		timeout: 30000
	});
	return formData;
}

async function globalGetVisData({appUrl, userCookie, visObjectId}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!visObjectId) {
		throw new Error("visObjectId is not defined");
	}

	const {"data": visData} = await axios.get(appUrl + `rest/vis/` + visObjectId, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//30 seconds
		timeout: 30000
	});
	return visData;
}

async function globalSyncEntity({appUrl, userCookie, entityId}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!entityId) {
		throw new Error("entityId is not defined");
	}

	const {"data": transactionId} = await axios.get(appUrl + `rest/umlsync/updateEntity/` + entityId, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//30 seconds
		timeout: 30000
	});
	return transactionId;
}

async function globalGetTransactionData({appUrl, userCookie, transactionId}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!transactionId) {
		throw new Error("transactionId is not defined");
	}

	const {"data": transactionData} = await axios.get(appUrl + `rest/transactions/status/` + transactionId, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//10 seconds
		timeout: 10000
	});
	return transactionData;
}

async function globalCreateForm({appUrl, userCookie, formData}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!formData) {
		throw new Error("formData is not defined");
	}

	let newFormObjId = getGuid();
	await globalSaveForm({
		"appUrl": appUrl,
		"userCookie": userCookie,
		"formObjectId": newFormObjId,
		"formData": formData
	});
}

async function globalSaveForm({appUrl, userCookie, formObjectId, formData}) {
	async function getFormsVersion() {
		const {"baseVersion": formsVersion} = await axios.get(appUrl + `rest/forms`, {
			headers: {
				"Content-Type": "application/json;charset=UTF-8",
				"Cookie": userCookie
			},
			//60 seconds
			timeout: 60000
		});
		return formsVersion;
	}

	let formsVersion = await getFormsVersion();
	await axios.post(appUrl + "rest/formbuilder/update", {
		"baseVersion": formsVersion,
		"changes": [{
			"changeType": "UPDATE",
			"objectId": formObjectId,
			"objectType": "Form",
			"form": formData
		}]
	}, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//60 seconds
		timeout: 60000
	});
}

async function globalCustomPost({appUrl, userCookie, path, requestData}){
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!path) {
		throw new Error("path is not defined");
	} else if (!requestData) {
		throw new Error("requestData is not defined");
	}

	const {"data": responseData} = await axios.post(appUrl + path, requestData, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//60 seconds
		timeout: 60000
	});
	return responseData;
}

async function globalLogin({appUrl, username, password}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!username) {
		throw new Error("username is not defined");
	} else if (!password) {
		throw new Error("password is not defined");
	}

	let loginData;
	try {
		loginData = await axios.post(appUrl + `rest/login`, {username, password}, {
			headers: {
				"Content-Type": "application/json;charset=UTF-8"
			},
			//10 seconds
			timeout: 10000
		});
	} catch (err) {
		if (err.response) {
			let responseStatus = err.response.status;
			if (responseStatus === "401") {
				throw new AuthError("Username or password is incorrect");
			} else {
				throw err;
			}
		} else {
			throw err;
		}
	}
	
	let [RawUserCookie] = loginData.headers["set-cookie"],
		UserCookie = RawUserCookie.substring(0, RawUserCookie.indexOf(";"));

	return UserCookie;
}

async function globalCheckCookie({appUrl, userCookie}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	}

	let checkCookieResult = true;
	try {
		await axios.head(appUrl + `rest/profile`, {
			headers: {
				"Cookie": userCookie
			},
			//10 seconds
			timeout: 10000
		});
	} catch (err) {
		if (err.response) {
			let responseStatus = err.response.status;
			if (responseStatus === "404") {
				console.warn("User cookie is not valid");
			} else {
				console.error(err);
			}
		} else if (CONNECTION_ERROR_CODES.includes(err.code)) {
			console.warn("There are connection troubles...");

			return await globalCheckCookie.apply(this, arguments);
		} else {
			console.error(err);
		}
		checkCookieResult = false;
	}

	return checkCookieResult;
}

function globalCookieManager({loginFunction, checkCookieFunction}){
	async function refreshCookie() {
		cookie = await loginFunction();
		return cookie;
	}

	let cookie = null;

	this.getCookie = function() {
		return cookie;
	}
	this.getActualCookie = async function() {
		if (!cookie) {
			return await refreshCookie();
		} else {
			let checkCookieResult = await checkCookieFunction(cookie);
			if (checkCookieResult === true) {
				return cookie;
			} else {
				console.log("Trying to get new user cookie...");
				
				return await refreshCookie();
			}
		}
	}
	this.refreshCookie = refreshCookie;
}

function globalSocketManager({getCookieFunction, appUrl}) {
	const socket = {
		"startPingPong": function() {
			const sendPing = () => {
				if (this.connected) {
					console.log('[Digit websocket] pingPong: ping');

					this.emit({
						action: "PING"
					});
				}
			}

			if (this.pingPongInt) {
				return;
			}

			console.log('[Digit websocket] start pingPong');

			this.pingPongInt = setInterval(sendPing, this.PING_PONG_TIMEOUT);
		},
		"stopPingPong": function() {
			console.log('[Digit websocket] stop pingPong');

			if (this.pingPongInt) {
				clearInterval(this.pingPongInt);
				this.pingPongInt = null;
			}
		},
		"registerSubscribe": async function(subscribeName, cb, createdCb) {
			if (!subscribeName) {
				throw new Error("subscribeName is not defined");
			} else if (!cb) {
				throw new Error("cb is not defined");
			}

			if (this.subscribes.size === 0) {
				await this.connect();
			}

			let subscribe = this.subscribes.get(subscribeName);
			if (subscribe) {
				subscribe.cb.push(cb);

				if (createdCb) {
					createdCb();
				}
			} else {
				this.emit({
					action: "REGISTRATION",
					names: [subscribeName]
				});

				this.subscribes.set(subscribeName, {
					"cb": [cb],
					"createdCb": createdCb
				});
			}
		},
		"resubscribe": function() {
			this.receivers.clear();

			for (let [subscribeName] of subscribes) {
				// retry registration
				this.emit({
					action: "REGISTRATION",
					names: [subscribeName]
				});
			}
		},
		"unregisterSubscribe": async function(subscribeName) {
			if (!subscribeName) {
				throw new Error("subscribeName is not defined");
			}

			this.emit({
				action: "UNREGISTRATION",
				names: [subscribeName]
			});

			let subscribe = subscribes.get(subscribeName);
			if (subscribe) {
				let subscribeId = subscribe.id;

				receivers.delete(subscribeId);
				subscribes.delete(subscribeName);
			}

			if (this.subscribes.size === 0) {
				await this.disconnect();
			}
		},
		"connect": async function() {
			function sleep(ms) {
				return new Promise(resolve => setTimeout(resolve, ms));
			}

			const CONNECT_TIMEOUT = 10000;

			const parsedUrl = new URL(appUrl);

			let protocol, host = parsedUrl.host;
			if (parsedUrl.protocol === 'https:') {
				protocol = "wss://";
			} else {
				protocol = "ws://";
			}

			let websocketConnectionUrl = protocol + host + "/websocket/";

			const cookie = getCookieFunction();

			const socketConnection = new WebSocket(websocketConnectionUrl);

			socketConnection.onopen = () => {
				console.log('[Digit websocket] connection established');

				this.connected = true;

				this.startPingPong();

				this.resubscribe();
			}

			socketConnection.onclose = (code, reason) => {
				console.log("[Digit websocket] DISCONNECT");
				console.log(code, reason);

				this.connected = false;

				this.stopPingPong();
			}

			socketConnection.onmessage = (event) => {
				let eventData = event.data;

				console.log("[Digit websocket] < : " + eventData);

				this.onmessage(eventData);
			}

			socketConnection.onerror = (error) => {
				console.error("[Digit websocket] ERROR: " + error);

				this.stopPingPong();
			}

			this.socketConnection = socketConnection;

			for (let i = 0; i < CONNECT_TIMEOUT;) {
				let checkInterval = 200;
				if (this.connected) {
					break;
				} else {
					await sleep(checkInterval);
					i += checkInterval;
				}
			}

			if (!this.connected) {
				throw new Error("Connetion not established until timeout");
			}
		},
		"disconnect": async function() {
			if (this.connected) {
				this.socketConnection.close();
			}
		},
		"emit": function(message) {
			if (this.connected) {
				let finalMessage = Object.assign(message, {
					"briefResponse": "false"
				});
				finalMessage = JSON.stringify(finalMessage);

				console.log("[Digit websocket] > " + finalMessage);

				this.socketConnection.send(finalMessage);
			} else {
				console.error('[Digit websocket] SOCKET NOT CONNECTED', message);
			}
		},
		"onmessage": function(message) {
			// {
			// "id":"d93c5a6e-8d27-4b1c-8689-9827a9d73966",
			// "originator":{"clusterId":"56aff8cb-d90f-4c5b-bd0f-3afa09ddedd2"},
			// "params":[{"id":"9e8939d5-23e0-f762-f893-3b93f98cd80c","type":"NEW"}],
			// "recipient":{"clusterId":"56aff8cb-d90f-4c5b-bd0f-3afa09ddedd2","id":"3e573a4c-3820-4618-80f0-150094afe038"},"status":"NEW","synch":false,"workspace":"__MAIN_WS__"
			//}

			let jsonData;
			try {
				jsonData = JSON.parse(message);
			} catch (err) {
				console.error('[Digit websocket] ERROR: response is not a JSON');

				return;
			}

			if (this.pingPongInt && jsonData.type === "pong") {
				console.log('[Digit websocket] pingPong: pong');

				return;
			}

			// SERVER RESPONSE FOR SUBSCRIBE
			// {"created":["OnNotification[admin]"],"id":"0071a85c-d2b2-4b44-88e8-da975086d85a"}

			if (jsonData['created']) {
				// Save server receiverId for unregister
				let [subscribeName] = jsonData.created;
				let subscribe = subscribes.get(subscribeName);
				if (!subscribe) {
					console.warn("[Digit websocket] ubnormal situation! Receive message without subscribe");

					return;
				}

				let subscribeId = jsonData.id;
				subscribe.id = subscribeId;
				// Add subscriber callback for call after receive message
				receivers.set(subscribeId, subscribe.cb);

				subscribe.createdCb && subscribe.createdCb();
			}

			let recipientData = jsonData.recipient;
			if (recipientData) {
				// IF RECEIVER EXIST NEED CALL THEM CALLBACK WITH RECEIVED PARAMS
				let subscribeId = recipientData.id;
				let cbs = receivers.get(subscribeId);

				if (cbs && cbs.length > 0) {
					let eventParams = jsonData.params;
					for (let cb of cbs) {
						cb(eventParams);
					}
				}
			}
		},
		"connected": false
	}
	Object.defineProperty(socket, "PING_PONG_TIMEOUT", {
		"enumerable": true,
		"value": 10000
	});
	Object.defineProperty(socket, "subscribes", {
		"enumerable": true,
		"value": new Map()
	});
	Object.defineProperty(socket, "receivers", {
		"enumerable": true,
		"value": new Map()
	});

	function getSubscribeNameByEntityId(entityId) {
		let subscribeName = "OnDataChanged[" + entityId + "]";
		return subscribeName;
	}

	async function watchEntity(entityId, handler) {
		let subscribeName = getSubscribeNameByEntityId(entityId);
		await socket.registerSubscribe(subscribeName, (eventParams) => {
			for (let eventParam of eventParams) {
				if (eventParam) {
					let objectId = eventParam.id,
						eventType = eventParam.type;

					switch (eventType) {
						case "NEW":
						case "UPDATED":
						case "DELETED":
							handler(eventType, objectId);
						break;
						default:
							console.warn("[Digit websocket] unknown event type: " + eventType);

							handler("UNKNOWN", objectId);
						break;
					}
				}
			}
		});
	}

	function stopWatchEntity(entityId) {
		let subscribeName = getSubscribeNameByEntityId(entityId);
		socket.unregisterSubscribe(subscribeName);
	}

    return {
        "watchEntity": watchEntity,
        "stopWatchEntity": stopWatchEntity
    }
}

function DigitApp({appUrl, username, password}) {
	function login() {
		return globalLogin({
			appUrl: appUrl,
			username,
			password
		});
	}
	function checkCookie(userCookie) {
		return globalCheckCookie({
			appUrl: appUrl,
			userCookie
		});
	}

	const CookieManager = new globalCookieManager({
		"loginFunction": login, 
		"checkCookieFunction": checkCookie
	});
	
	const SocketManager = new globalSocketManager({
		"getCookieFunction": CookieManager.getActualCookie.bind(CookieManager),
		"appUrl": appUrl
	});

	this.FORM_ELEMENT_TYPES = new TotallyFrozenObject({
		//группа полей
		"FIELD_GROUP": "FormFieldset",
		//ссылка
		"LINK": "FormLink",
		//таблица
 		"TABLE": "FormGrid",
		//текстовое поле
		"INPUT": "FormInput",
		//текстовая форма
		"TEXT_AREA": "FormTextarea",
		//файловое поле
		"FILE_FIELD": "FormFilefield",
		//поле даты
		"DATE": "FormDate",
		//поле даты и время
		"DATETIME": "FormDatetime",
		//радио
		"RADIO": "FormRadio",
		//флажок
		"CHECKBOX": "FormCheckbox",
		//элемент адрес
		"ADDRESS": "FormAddress"
	});

	this.ENTITIES = new TotallyFrozenObject({
		//пользователь
		"USER": {
			"fullName": "UserMetadata.User",
			"entityId": "e333d3ed-3ce3-fab3-33b3-b3fc3b3dd3a3"
		}
	});

	this.createObject = async function(newObjectData) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalCreateObject({
			appUrl: appUrl,
			userCookie, 
			newObjectData
		});
	}
	this.saveObject = async function(objectId, objectData) {
		const userCookie = await CookieManager.getActualCookie();
		await globalSaveObject({
			appUrl: appUrl,
			userCookie,
			objectId,
			objectData
		});
	}
	this.getObject = async function(objectId, attributesToGet) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetObject({
			appUrl: appUrl,
			userCookie,
			objectId,
			attributesToGet
		});
	}
	this.getObjects = async function(searchParameters) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetObjects({
			appUrl: appUrl,
			userCookie, 
			searchParameters
		});
	}
	this.deleteObjects = async function(deleteObjectIds) {
		const userCookie = await CookieManager.getActualCookie();
		await globalDeleteObjects({
			appUrl: appUrl,
			userCookie, 
			deleteObjectIds
		});
	}
	this.getForms = async function() {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetForms({
			appUrl: appUrl,
			userCookie
		});
	}
	this.getVises = async function() {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetVises({
			appUrl: appUrl,
			userCookie
		});
	}
	this.getWorkflows = async function() {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetWorkflows({
			appUrl: appUrl,
			userCookie
		});
	}
	this.getUMLSchema = async function() {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetUMLSchema({
			appUrl: appUrl,
			userCookie
		});
	}
	this.getFormData = async function(formObjectId) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetFormData({
			appUrl: appUrl,
			userCookie,
			formObjectId
		});
	}
	this.getVisData = async function(visObjectId) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetVisData({
			appUrl: appUrl,
			userCookie,
			visObjectId
		});
	}
	this.syncEntity = async function(entityId) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalSyncEntity({
			appUrl: appUrl,
			userCookie,
			entityId
		});
	}
	this.getTransactionData = async function(transactionId) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetTransactionData({
			appUrl: appUrl,
			userCookie,
			transactionId
		});
	}
	this.createForm = async function(formData) {
		const userCookie = await CookieManager.getActualCookie();
		await globalCreateForm({
			appUrl: appUrl,
			userCookie,
			formData
		});
	}
	this.saveForm = async function(formObjectId, formData) {
		const userCookie = await CookieManager.getActualCookie();
		await globalSaveForm({
			appUrl: appUrl,
			userCookie,
			formObjectId,
			formData
		});
	}
	this.customPost = async function(path, requestData) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalCustomPost({
			appUrl: appUrl,
			userCookie,
			path,
			requestData
		});
	}
	this.watchEntity = async function(entityId, handler) {
		SocketManager.watchEntity(entityId, handler);
	}
	this.stopWatchEntity = async function (entityId) {
		SocketManager.stopWatchEntity(entityId);
	}
}

module.exports.DigitApp = DigitApp;