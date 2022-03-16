const {"v4": getGuid} = require('uuid');
const axios = require('axios');
const axiosRetry = require('axios-retry');
const {WebSocket} = require("ws");
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const dayjs = require('dayjs');

axiosRetry(axios, {
	"retries": 10,
	"retryDelay": axiosRetry.exponentialDelay
});

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

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function syncResistant(functionToResist) {
	const RETRY_COUNT_LIMIT = 12,
		RETRY_INTERVAL = 5000;

	let attempt = 0;

	return async function() {
		for (;;) {
			try {
				attempt++;

				return await functionToResist.apply(this, arguments);
			} catch (err) {
				if (err.response) {
					let responseStatus = err.response.status;
					if (responseStatus === 503) {
						console.info("Synchronization is in progress...");
						if (attempt <= RETRY_COUNT_LIMIT) {
							await sleep(RETRY_INTERVAL);
						} else {
							throw err;
						}
					} else {
						throw err;
					}
				} else {
					throw err;
				}
			}
		}
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
	} else if (searchParameters.objectIds) {
		if (!Array.isArray(searchParameters.objectIds)) {
			throw new Error("searchParameters.objectIds is not Array");
		} else if (searchParameters.objectId) {
			throw new Error("objectId and objectIds searchParameters are exclusive");
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
	if (searchParameters.search) {
		searchObject.search = searchParameters.search;
	}
	if (searchParameters.objectId) {
		searchObject.objectId = searchParameters.objectId;
	} else if (searchParameters.objectIds) {
		searchObject.objectIds = searchParameters.objectIds;
	}
	if (searchParameters.gridObjectId) {
		searchObject.gridObjectId = searchParameters.gridObjectId;
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

async function globalSyncDocuments({appUrl, userCookie, entityId, objectIds}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!entityId) {
		throw new Error("entityId is not defined");
	} else if (!objectIds) {
		throw new Error("objectIds is not defined");
	} else if (!Array.isArray(objectIds)) {
		throw new Error("type of objectIds is not Array");
	} else if (objectIds.length === 0) {
		throw new Error("length of objectIds is 0");
	}

	const {"data": transactionId} = await axios.post(appUrl + `rest/umlsync/updateSolrDocuments`, {
		"ids": objectIds,
		"entityId": entityId
	}, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//30 seconds
		timeout: 30000
	});
	return transactionId;
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

async function globalDownloadFile({appUrl, userCookie, fileId, options}) {
	async function downloadFileWithAxios(fileUrl, userCookie, filePath) {
		if (!fileUrl) {
			throw new Error("fileUrl is not defined");
		} else if (!userCookie) {
			throw new Error("userCookie is not defined");
		} else if (!filePath) {
			throw new Error("filePath is not defined");
		}

		const writer = fs.createWriteStream(filePath);

		const response = await axios.get(fileUrl, {
			headers: {
				"Cookie": userCookie
			},
			responseType: 'stream',
			//10 minutes
			timeout: 600000
		});

		response.data.pipe(writer);

		return new Promise((resolve, reject) => {
			writer.on('finish', resolve.bind(this, response));
			writer.on('error', reject);
		});
	}

	function getFileNameFromContentDisposition(contentDisposition) {
		if (!contentDisposition) {
			throw new Error("contentDisposition is not defined");
		}

		let fileName;

		let filenameRegex = /filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/gmi;
		let matches = filenameRegex.exec(contentDisposition);
		if (matches && matches[1]) {
			fileName = matches[1];
			fileName = decodeURIComponent(fileName);
		}

		return fileName;
	}

	async function renameFile(currentFilePath, newFileName) {
		if (!currentFilePath) {
			throw new Error("currentFilePath is not defined");
		} else if (!newFileName) {
			throw new Error("newFileName is not defined");
		}

		let fileDir = path.dirname(currentFilePath);
		let newFilePath = fileDir + "/" + newFileName;
		await fsPromises.rename(currentFilePath, newFilePath);
		return newFilePath;
	}

	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!fileId) {
		throw new Error("fileId is not defined");
	}

	let currentDir = process.cwd();
	let filePath;
	if (options) {
		let customFileDir = options.fileDir;
		if (customFileDir) {
			filePath = path.resolve(currentDir, customFileDir, fileId);
		} else {
			filePath = path.resolve(currentDir, fileId);
		}
	} else {
		filePath = path.resolve(currentDir, fileId);
	}

	let fileUrl = appUrl + 'rest/file/download/' + fileId;

	let responseData = await downloadFileWithAxios(fileUrl, userCookie, filePath);
	if (options && options.fileName) {
		let customFileName = options.fileName;
		filePath = await renameFile(filePath, customFileName);
	} else {
		let responseHeaders = responseData.headers;
		if (responseHeaders) {
			let contentDisposition = responseHeaders['content-disposition'];
			if (contentDisposition) {
				let fileName = getFileNameFromContentDisposition(contentDisposition);
				filePath = await renameFile(filePath, fileName);
			}
		}
	}

	return filePath;
}

async function globalGetFileInfo({appUrl, userCookie, fileId}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!fileId) {
		throw new Error("fileId is not defined");
	}

	const {"data": fileInfo} = await axios.post(appUrl + 'rest/file/info', {
		"objectId": fileId
	}, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//10 seconds
		timeout: 10000
	});

	return fileInfo;
}

async function globalGetDictionaries({appUrl, userCookie}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	}

	const {"data": dictionaries} = await axios.get(appUrl + `rest/dictionary`, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//60 seconds
		timeout: 60000
	});
	return dictionaries;
}

async function globalCreateDictionary({appUrl, userCookie, dictionary}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!dictionary) {
		throw new Error("dictionary is not defined");
	}

	let dictionaryObject = {};
	if (dictionary.label) {
		dictionaryObject.label = dictionary.label;
	} else {
		throw new Error("userCookie is not defined");
	}

	if (!dictionary.uniqueFields || (dictionary.uniqueFields && !dictionary.uniqueFields.length)) {
		dictionaryObject.uniqueFields = ["name","code"];
	} else {
		dictionaryObject.uniqueFields = dictionary.uniqueFields;
	}

	if (!dictionary.customFields || (dictionary.customFields && !dictionary.customFields.length)) {
		dictionaryObject.customFields = [];
	} else {
		dictionaryObject.customFields = dictionary.customFields;
	}

	let {"data": newDictionary} = await axios.post(appUrl + `rest/dictionary`, dictionaryObject, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//60 seconds
		timeout: 60000
	});
	return newDictionary.objectId;
}

async function globalAddDictionaryItem({appUrl, userCookie, dictionaryId, dictionaryItem}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!dictionaryId) {
		throw new Error("dictionaryId is not defined");
	} else if (!dictionaryItem) {
		throw new Error("dictionaryItem is not defined");
	}

	let {"data": mewDictionaryItem} = await axios.post(appUrl + `rest/dictionary/${dictionaryId}/item`, dictionaryItem, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//60 seconds
		timeout: 60000
	});

	return mewDictionaryItem.objectId;
}

async function globalIsWorkingDay({appUrl, userCookie, verifiedDate, workingDaysInfoMap}) {
	async function getSpeacialDaysByYear({appUrl, userCookie, verifiedYear}) {
		if (!appUrl) {
			throw new Error("appUrl is not defined");
		} else if (!userCookie) {
			throw new Error("userCookie is not defined");
		} else if (!verifiedYear) {
			throw new Error("verifiedYear is not defined");
		} else if (typeof verifiedYear !== "string") {
			throw new Error("type of verifiedYear is not string");
		}

		let {"data": specialDays} = await axios.get(appUrl + "rest/calendar/getspecialdays/" + verifiedYear, {
			headers: {
				"Content-Type": "application/json;charset=UTF-8",
				"Cookie": userCookie
			},
			//60 seconds
			timeout: 60000
		});
		for (let specialDay of specialDays) {
			specialDay.date = dayjs(specialDay.date);
		}

		return specialDays;
	}

	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (verifiedDate && !(verifiedDate instanceof Date)) {
		throw new Error("verifiedDate is not Date");
	} else if (!workingDaysInfoMap) {
		throw new Error("workingDaysInfoMap is not defined");
	}

	const SATURDAY_CODE = 6,
		SUNDAY_CODE = 0;

	let isWorkingDay = true;

	let localVerifiedDate;
	if (verifiedDate) {
		localVerifiedDate = dayjs(verifiedDate);
	} else {
		localVerifiedDate = dayjs();
	}

	let localVerifiedDateString = localVerifiedDate.format('DD.MM.YYYY');
	if (workingDaysInfoMap.has(localVerifiedDateString)) {
		isWorkingDay = workingDaysInfoMap.get(localVerifiedDateString);
	} else {
		let verifiedDayOfWeek = localVerifiedDate.day();
		if (verifiedDayOfWeek === SATURDAY_CODE || verifiedDayOfWeek === SUNDAY_CODE) {
			isWorkingDay = false;
		}

		let verifiedYear = String(localVerifiedDate.year());
		let specialDaysData = await getSpeacialDaysByYear({
			"appUrl": appUrl,
			"userCookie": userCookie,
			"verifiedYear": verifiedYear
		});

		for (let specialDayData of specialDaysData) {
			let specialDay = specialDayData.date,
				specialDayWorking = specialDayData.working;

			if (localVerifiedDate.isSame(specialDay, "day")) {
				if (specialDayWorking) {
					isWorkingDay = true;
				} else {
					isWorkingDay = false;
				}

				break;
			}
		}

		workingDaysInfoMap.set(localVerifiedDateString, isWorkingDay);
	}

	return isWorkingDay;
}

async function globalIsDigitWorking({appUrl}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	}

	let digitIsWorking = true;

	try {
		let {"data": monitoringData} = await axios.get(appUrl + `rest/monitoring/info`, {
			//2 seconds
			timeout: 2000
		});

		if (monitoringData) {
			let applicationMonitoringData = monitoringData.Application;
			if (applicationMonitoringData) {
				if (applicationMonitoringData.status !== "OK") {
					digitIsWorking = false;
				}
			} else {
				digitIsWorking = false;
			}
		} else {
			digitIsWorking = false;
		}
	} catch (err) {
		digitIsWorking = false;
	}

	return digitIsWorking;
}

async function globalWaitServerReady({appUrl}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	}

	let serverIsNotReady = true;

	do {
		let digitIsWorking = await globalIsDigitWorking({appUrl});
		if (digitIsWorking) {
			serverIsNotReady = false;
		} else {
			await sleep(10000);
		}
	} while (serverIsNotReady);
}

async function globalExecuteServerJS({appUrl, userCookie, jsToExecute}) {
	if (!appUrl) {
		throw new Error("appUrl is not defined");
	} else if (!userCookie) {
		throw new Error("userCookie is not defined");
	} else if (!jsToExecute) {
		throw new Error("jsToExecute is not defined");
	}

	const {"data": executionData} = await axios.post(appUrl + `rest/jsapi/execute`, jsToExecute, {
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"Cookie": userCookie
		},
		//60 seconds
		timeout: 60000
	});

	return executionData;
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
			if (responseStatus === 401) {
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
		await axios.get(appUrl + `rest/notifications`, {
			headers: {
				"Cookie": userCookie
			},
			//10 seconds
			timeout: 10000
		});
	} catch (err) {
		if (err.response) {
			let responseStatus = err.response.status;
			if (responseStatus === 404) {
				console.warn("User cookie is not valid");
			} else {
				console.error(err);
			}
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
					console.debug('[Digit websocket] pingPong: ping');

					this.emit({
						action: "PING"
					});
				}
			}

			if (this.pingPongInt) {
				return;
			}

			console.debug('[Digit websocket] start pingPong');

			this.pingPongInt = setInterval(sendPing, this.PING_PONG_TIMEOUT);
		},
		"stopPingPong": function() {
			console.debug('[Digit websocket] stop pingPong');

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

			let needToEstablishConnection = false;
			if (this.subscribes.size === 0 && !this.connected) {
				if (!this.socketConnection) {
					needToEstablishConnection = true;
				}
			}

			let subscribe = this.subscribes.get(subscribeName);
			if (subscribe) {
				subscribe.cb.push(cb);

				if (createdCb) {
					createdCb();
				}
			} else {
				if (this.connected) {
					this.emit({
						action: "REGISTRATION",
						names: [subscribeName]
					});
				}

				this.subscribes.set(subscribeName, {
					"cb": [cb],
					"createdCb": createdCb
				});
			}

			if (needToEstablishConnection) {
				await this.connect();
			}
		},
		"resubscribe": function() {
			this.receivers.clear();

			for (let [subscribeName] of this.subscribes) {
				// retry registration
				this.emit({
					action: "REGISTRATION",
					names: [subscribeName]
				});
			}
		},
		"unregisterSubscribe": function(subscribeName) {
			if (!subscribeName) {
				throw new Error("subscribeName is not defined");
			}

			if (this.connected) {
				this.emit({
					action: "UNREGISTRATION",
					names: [subscribeName]
				});
			}

			let subscribe = this.subscribes.get(subscribeName);
			if (subscribe) {
				let subscribeId = subscribe.id;

				this.receivers.delete(subscribeId);
				this.subscribes.delete(subscribeName);
			}

			if (this.subscribes.size === 0 && this.connected) {
				this.disconnect();
			}
		},
		"connect": async function() {
			const CONNECT_TIMEOUT = 10000;

			const parsedUrl = new URL(appUrl);
			let wsProtocol, wsHost = parsedUrl.host;
			if (parsedUrl.protocol === 'https:') {
				wsProtocol = "wss://";
			} else {
				wsProtocol = "ws://";
			}
			let websocketConnectionUrl = wsProtocol + wsHost + "/websocket/";

			let cookie;
			try {
				cookie = await getCookieFunction();
			} catch (err) {
				console.error(err);

				console.debug("[Digit websocket] Cannot call getCookieFunction function");
				console.debug("[Digit websocket] Rety call getCookieFunction after: " + this.RECONNECT_INTERVAL);

				setTimeout(this.connect.bind(this), this.RECONNECT_INTERVAL);
			}

			if (cookie) {
				const socketConnection = new WebSocket(websocketConnectionUrl, [], {
					"headers": {
						"Cookie": cookie
					}
				});

				socketConnection.onopen = (openEvent) => {
					console.debug('[Digit websocket] connection established');

					this.connected = true;

					this.startPingPong();

					this.resubscribe();
				}

				socketConnection.onclose = (closeEvent) => {
					console.debug("[Digit websocket] DISCONNECT");
					console.debug("[Digit websocket] code: " + closeEvent.code);
					console.debug("[Digit websocket] reason: " + closeEvent.reason);

					this.connected = false;

					this.stopPingPong();

					if (this.subscribes.size > 0) {
						setTimeout(this.connect.bind(this), this.RECONNECT_INTERVAL);
					}
				}

				socketConnection.onmessage = (messageEvent) => {
					let eventData = messageEvent.data;

					console.debug("[Digit websocket] < : " + eventData);

					this.onmessage(eventData);
				}

				socketConnection.onerror = (errorEvent) => {
					console.error(errorEvent);

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
			}
		},
		"disconnect": function() {
			console.debug("[Digit websocket] force disconnect websocket");

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

				console.debug("[Digit websocket] > " + finalMessage);

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
				console.debug('[Digit websocket] pingPong: pong');

				return;
			}

			// SERVER RESPONSE FOR SUBSCRIBE
			// {"created":["OnNotification[admin]"],"id":"0071a85c-d2b2-4b44-88e8-da975086d85a"}
			if (jsonData['created']) {
				// Save server receiverId for unregister
				let [subscribeName] = jsonData.created;
				let subscribe = this.subscribes.get(subscribeName);
				if (!subscribe) {
					console.warn("[Digit websocket] ubnormal situation! Receive message without subscribe");

					return;
				}

				let subscribeId = jsonData.id;
				subscribe.id = subscribeId;
				// Add subscriber callback for call after receive message
				this.receivers.set(subscribeId, subscribe.cb);

				subscribe.createdCb && subscribe.createdCb();
			}

			let recipientData = jsonData.recipient;
			if (recipientData) {
				// IF RECEIVER EXIST NEED CALL THEM CALLBACK WITH RECEIVED PARAMS
				let subscribeId = recipientData.id;
				let cbs = this.receivers.get(subscribeId);

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
	Object.defineProperty(socket, "RECONNECT_INTERVAL", {
		"enumerable": true,
		"value": 3000
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
	const login = syncResistant(function login() {
		return globalLogin({
			appUrl: appUrl,
			username,
			password
		});
	});
	const checkCookie = syncResistant(function checkCookie(userCookie) {
		return globalCheckCookie({
			appUrl: appUrl,
			userCookie
		});
	});

	const CookieManager = new globalCookieManager({
		"loginFunction": login, 
		"checkCookieFunction": checkCookie
	});
	
	const SocketManager = new globalSocketManager({
		"getCookieFunction": CookieManager.getActualCookie.bind(CookieManager),
		"appUrl": appUrl
	});

	const workingDaysInfoMap = new Map();

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

	this.createObject = syncResistant(async function(newObjectData) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalCreateObject({
			appUrl: appUrl,
			userCookie, 
			newObjectData
		});
	});
	this.saveObject = syncResistant(async function(objectId, objectData) {
		const userCookie = await CookieManager.getActualCookie();
		await globalSaveObject({
			appUrl: appUrl,
			userCookie,
			objectId,
			objectData
		});
	});
	this.getObject = syncResistant(async function(objectId, attributesToGet) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetObject({
			appUrl: appUrl,
			userCookie,
			objectId,
			attributesToGet
		});
	});
	this.getObjects = syncResistant(async function(searchParameters) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetObjects({
			appUrl: appUrl,
			userCookie, 
			searchParameters
		});
	});
	this.deleteObjects = syncResistant(async function(deleteObjectIds) {
		const userCookie = await CookieManager.getActualCookie();
		await globalDeleteObjects({
			appUrl: appUrl,
			userCookie, 
			deleteObjectIds
		});
	});
	this.getForms = syncResistant(async function() {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetForms({
			appUrl: appUrl,
			userCookie
		});
	});
	this.getVises = syncResistant(async function() {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetVises({
			appUrl: appUrl,
			userCookie
		});
	});
	this.getWorkflows = syncResistant(async function() {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetWorkflows({
			appUrl: appUrl,
			userCookie
		});
	});
	this.getUMLSchema = syncResistant(async function() {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetUMLSchema({
			appUrl: appUrl,
			userCookie
		});
	});
	this.getFormData = syncResistant(async function(formObjectId) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetFormData({
			appUrl: appUrl,
			userCookie,
			formObjectId
		});
	});
	this.getVisData = syncResistant(async function(visObjectId) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetVisData({
			appUrl: appUrl,
			userCookie,
			visObjectId
		});
	});
	this.syncEntity = syncResistant(async function(entityId) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalSyncEntity({
			appUrl: appUrl,
			userCookie,
			entityId
		});
	});
	this.getTransactionData = syncResistant(async function(transactionId) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetTransactionData({
			appUrl: appUrl,
			userCookie,
			transactionId
		});
	});
	this.syncDocuments = syncResistant(async function({entityId, objectIds}) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalSyncDocuments({
			appUrl: appUrl,
			userCookie,
			entityId,
			objectIds
		});
	});
	this.createForm = syncResistant(async function(formData) {
		const userCookie = await CookieManager.getActualCookie();
		await globalCreateForm({
			appUrl: appUrl,
			userCookie,
			formData
		});
	});
	this.saveForm = syncResistant(async function(formObjectId, formData) {
		const userCookie = await CookieManager.getActualCookie();
		await globalSaveForm({
			appUrl: appUrl,
			userCookie,
			formObjectId,
			formData
		});
	});
	this.customPost = syncResistant(async function(path, requestData) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalCustomPost({
			appUrl: appUrl,
			userCookie,
			path,
			requestData
		});
	});
	this.watchEntity = async function(entityId, handler) {
		await SocketManager.watchEntity(entityId, handler);
	}
	this.stopWatchEntity = async function (entityId) {
		await SocketManager.stopWatchEntity(entityId);
	}
	this.downloadFile = syncResistant(async function(fileId, options) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalDownloadFile({
			appUrl: appUrl,
			userCookie,
			fileId,
			options
		});
	});
	this.getFileInfo = syncResistant(async function(fileId) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetFileInfo({
			appUrl: appUrl,
			userCookie,
			fileId
		});
	});
	this.isWorkingDay = syncResistant(async function(verifiedDate) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalIsWorkingDay({
			appUrl: appUrl,
			userCookie,
			verifiedDate,
			workingDaysInfoMap
		});
	});
	this.getDictionaries = syncResistant(async function() {
		const userCookie = await CookieManager.getActualCookie();
		return await globalGetDictionaries({
			appUrl: appUrl,
			userCookie
		});
	});
	this.saveDictionary = syncResistant(async function(dictionary) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalCreateDictionary({
			appUrl: appUrl,
			userCookie,
			dictionary
		});
	});
	this.addDictionaryItem = syncResistant(async function(dictionaryId, dictionaryItem) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalAddDictionaryItem({
			appUrl: appUrl,
			userCookie,
			dictionaryId,
			dictionaryItem
		});
	});
	this.isDigitWorking = async function() {
		return await globalIsDigitWorking({
			appUrl: appUrl
		});
	}
	this.waitServerReady = async function() {
		return await globalWaitServerReady({
			appUrl: appUrl
		});
	}
	this.executeServerJS = syncResistant(async function(jsToExecute) {
		const userCookie = await CookieManager.getActualCookie();
		return await globalExecuteServerJS({
			appUrl: appUrl,
			userCookie,
			jsToExecute
		});
	});
}

module.exports.DigitApp = DigitApp;
