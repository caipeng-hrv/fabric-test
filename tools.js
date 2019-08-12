'use strict';

const Promise = require('bluebird');
const Fabric_CA_Client = require('fabric-ca-client');
const Fabric_Client = require('fabric-client');
const fs = require('fs');
const path = require('path');
const chaincodePath = 'chaincode/github.com/mycc';
const certPath = './first-network/crypto-config/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem';
async function initClient() {
	//初始化client
	const client = new Fabric_Client();
	const state_store = await Fabric_Client.newDefaultKeyValueStore({
		path: 'wallet'
	});
	client.setStateStore(state_store);
	const crypto_suite = Fabric_Client.newCryptoSuite();
	var crypto_store = Fabric_Client.newCryptoKeyStore({
		path: 'wallet'
	});
	crypto_suite.setCryptoKeyStore(crypto_store);
	client.setCryptoSuite(crypto_suite);
	//初始化ca_client

	const ca_client = new Fabric_CA_Client('https://localhost:7054', {
		trustedRoots: fs.readFileSync(certPath),
		verify: false
	}, 'ca-org1', crypto_suite);
	return {
		client: client,
		ca_client: ca_client
	};
}
async function enrolleAdmin(client, ca_client) {
	try {
		// first check to see if the admin is already enrolled
		var user = await client.getUserContext('admin', true);
		if (user && user.isEnrolled()) {
			console.log('An identity for the  user "admin" already exists in the wallet');
			return;
		};
		const enrollment = await ca_client.enroll({
			enrollmentID: 'admin',
			enrollmentSecret: 'adminpw'
		});
		user = await client.createUser({
			username: 'admin',
			mspid: 'Org1MSP',
			cryptoContent: {
				privateKeyPEM: enrollment.key.toBytes(),
				signedCertPEM: enrollment.certificate
			}
		});
		await client.setUserContext(user);
		console.log('Successfully enrolled admin user "admin"');

	} catch (error) {
		console.error(`Failed to enroll admin user "admin": ${error}`);

	}
};
async function registerUser(userName, client, ca_client) {
	try {
		// first check to see if the user is already enrolled
		var user = await client.getUserContext(userName, true);
		if (user && user.isEnrolled()) {
			console.log(`An identity for the  user '${userName}' already exists in the wallet`);
			return;
		};
		var admin_user = await client.getUserContext('admin', true);
		const userPwd = await ca_client.register({
			enrollmentID: userName,
			affiliation: 'org1.department1',
			role: 'client'
		}, admin_user)
		const enrollment = await ca_client.enroll({
			enrollmentID: userName,
			enrollmentSecret: userPwd
		});
		user = await client.createUser({
			username: userName,
			mspid: 'Org1MSP',
			cryptoContent: {
				privateKeyPEM: enrollment.key.toBytes(),
				signedCertPEM: enrollment.certificate
			}
		});
		await client.setUserContext(user);
		console.log(`Successfully register  user ${userName} `);

	} catch (error) {
		console.error(`Failed to register  user ${userName}: ${error}`);

	}
};
async function invoke(client,userName,chaincodeId,fcn,args) {
	try {
		const user = await client.getUserContext(userName, true);
		if (!user) {
			throw new Error('\n\nFailed to get user.... run registerUser.js');
		};
		//连接peer
		const peer = client.newPeer('grpcs://localhost:7051', {
			'ssl-target-name-override': 'peer0.org1.example.com',
			pem: fs.readFileSync(certPath, 'utf8')
		});

		//1.创建通道
		const channel = client.newChannel('mychannel');
		await channel.initialize({
			discover: true,
			asLocalhost: true,
			target: peer
		});
		//2.创建交易ID
		const tx_id = client.newTransactionID(true);
		const proposal_request = {
			targets: [peer],
			chaincodeId: chaincodeId,
			fcn: fcn,
			args: args,
			chainId: 'mychannel',
			txId: tx_id
		};
		// const proposal_request = {
		// 	targets: [peer],
		// 	chaincodeId: 'mycc',
		// 	fcn: 'delete',
		// 	args: ['A'],
		// 	chainId: 'mychannel',
		// 	txId: tx_id
		// };
		//3.发送交易到背书节点
		const proposalResults = await channel.sendTransactionProposal(proposal_request);
		var responses = proposalResults[0];
		if (responses[0] && responses[0].response.status == 200) {
			console.log('Successfully sent Proposal and received response:Status - 200')
		} else {
			console.log('Failed to send Proposal and Error:', responses[0].toString())
			return;
		}
		//4.发送交易到order节点，并监听交易是否成功
		const commitRequest = {
			proposalResponses: responses,
			proposal: proposalResults[1]
		};

		const eventHub = channel.newChannelEventHub(peer);
		const submitResult = await Promise.all([channel.sendTransaction(commitRequest), getTranscationResult(eventHub, tx_id.getTransactionID())]);
		if (submitResult[0].status === 'SUCCESS') {
			console.log('Successfully sent transaction to the orderer');
		} else {
			throw new Error('Failed to order the transaction. Error code:', submitResult[0].status);
		};
		if (submitResult[1] && submitResult[1].event_status === 'VALID') {
			console.log('Successfully committed the change to the ledger by the peer');
			let rs = responses[0].response.payload.toString();
			return rs;
		} else {
			throw new Error(submitResult[1].toString())
		};


	} catch (error) {
		console.error(`Failed to submit transaction: ${error}`);
		process.exit(1);
	}
}

async function installChaincode(client, chaincodeName, chaincodePath,
	chaincodeVersion, chaincodeType) {
	try {
		await client.getUserContext('admin', true);
		// 连接peer
		const peer = client.newPeer('grpcs://localhost:8051', {
			'ssl-target-name-override': 'peer1.org1.example.com',
			pem: fs.readFileSync(certPath, 'utf8')
		});

		//1.创建通道
		const channel = client.newChannel('mychannel');
		await channel.initialize({
			discover: true,
			asLocalhost: true,
			target: peer
		});
		
		let cert = fs.readFileSync('./first-network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/admincerts/Admin@org1.example.com-cert.pem', 'utf8');
		var pkPath = './first-network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/';

		let pk = fs.readFileSync(pkPath + fs.readdirSync(pkPath), 'utf8');
		client.setAdminSigningIdentity(pk, cert, 'Org1MSP');
		
		var request = {
			chaincodePath: chaincodePath,
			chaincodeId: chaincodeName,
			chaincodeVersion: chaincodeVersion,
			chaincodeType: chaincodeType,
			channelNames: 'mychannel'
		};
		let results = await client.installChaincode(request);
		console.log(results[0]);

	} catch (error) {
		console.log('********:', error)
	}
};
async function instantiateChaincode(client,chaincodeName) {
	try {
		const user = await client.getUserContext('admin', true);
		//连接peer
		const peer = client.newPeer('grpcs://localhost:7051', {
			'ssl-target-name-override': 'peer0.org1.example.com',
			pem: fs.readFileSync(certPath, 'utf8')
		});
		//1.创建通道
		const channel = client.newChannel('mychannel');
		await channel.initialize({
			discover: true,
			asLocalhost: true,
			target: peer
		});
		let cert = fs.readFileSync('./first-network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/admincerts/Admin@org1.example.com-cert.pem', 'utf8');
		var pkPath = './first-network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/';

		let pk = fs.readFileSync(pkPath + fs.readdirSync(pkPath), 'utf8');
		client.setAdminSigningIdentity(pk, cert, 'Org1MSP');
		const tx_id = client.newTransactionID(true);
		let upgradeResponse = await channel.sendInstantiateProposal({
		    targets: peer,
		    chaincodeType: 'node',
		    chaincodeId: chaincodeName,
		    chaincodeVersion: 'v1',
		    args: [],
		    fcn: 'initLedger',
		    txId: tx_id
		});
		var responses = upgradeResponse[0];
		if (responses[0] &&responses[0].response&& responses[0].response.status == 200) {
			console.log('Successfully sent Proposal and received response:Status - 200')
		} else {
			console.log('Failed to send Proposal and Error:', responses[0].toString())
			return;
		}

	} catch (error) {
		console.error(`Failed to submit transaction: ${error}`);
		process.exit(1);
	}
}
function getTranscationResult(eventHub, txId) {
	return new Promise((resolve, reject) => {
		let handle = setTimeout(() => {
			eventHub.unregisterTxEvent(txId);
			eventHub.disconnect();
			resolve({
				event_status: 'TIMEOUT'
			});
		}, 30000);

		eventHub.registerTxEvent(txId, (tx, code) => {
			clearTimeout(handle);
			const return_status = {
				event_status: code,
				tx_id: txId
			};
			if (code !== 'VALID') {
				console.error('The transaction was invalid, code = ' + code);
				resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
			} else {
				console.log('The transaction has been committed on peer ' + eventHub.getPeerAddr());
				resolve(return_status);
			}
		}, (err) => {
			reject(new Error('The transaction committed to the order failed ::' + err));
		}, {
			disconnect: true
		});
		eventHub.connect();
		console.log('Registered transaction listener with the peer event service for transaction ID:' + txId);
	});

};
(async function() {
	const {
		client,
		ca_client
	} = await initClient();
	await enrolleAdmin(client, ca_client);
	await registerUser('user5', client, ca_client);
	// let result = await invoke(client,'user5','company','queryCom',['BABA']);
	// let result = await invoke(client,'user5','company','addCom',['MSFT','微软','10,580.54']);
	// let result = await invoke(client,'user5','company','queryAllComs',[]);
	let result = await invoke(client,'user5','company','changeBalance',['BABA','4542.74'])
	console.log(result)
	// await installChaincode(client,'myCar1','chaincode/my-car','v1','node');
	// await instantiateChaincode(client,'myCar1');
	// await installChaincode(client, 'mycc', chaincodePath, 'v0', 'node', 'admin');
	// await instantiateChaincode(client,'mycc');

})()