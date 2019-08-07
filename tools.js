'use strict';

const Fabric_CA_Client = require('fabric-ca-client');
const Fabric_Client = require('fabric-client');
const fs = require('fs');
const path = require('path');
const certPath = '/Users/cp/project/fabric/fabric-samples/first-network/crypto-config/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem';
async function initClient(){
		//初始化client
		const client = new Fabric_Client();
		const state_store = await Fabric_Client.newDefaultKeyValueStore({path:'wallet'});
		client.setStateStore(state_store);
    	const crypto_suite = Fabric_Client.newCryptoSuite();
	    var crypto_store = Fabric_Client.newCryptoKeyStore({path: 'wallet'});
	    crypto_suite.setCryptoKeyStore(crypto_store);
	    client.setCryptoSuite(crypto_suite);
	    //初始化ca_client

	    const ca_client = new Fabric_CA_Client('https://localhost:7054', {
			trustedRoots: fs.readFileSync(certPath),
			verify: false
		},'ca-org1',crypto_suite);
		return {client:client,ca_client:ca_client};
}
async function enrolleAdmin(client,ca_client) {
	try {
    	// first check to see if the admin is already enrolled
    	var user = await client.getUserContext('admin', true);
		if (user && user.isEnrolled()) {
			console.log('An identity for the  user "admin" already exists in the wallet');
			return;
		};
		const enrollment =  await ca_client.enroll({
          enrollmentID: 'admin',
          enrollmentSecret: 'adminpw'
        });
        user = await client.createUser({username: 'admin',
          mspid: 'Org1MSP',
          cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
      	});
      	await client.setUserContext(user);
      	console.log('Successfully enrolled admin user "admin"');

	} catch (error) {
		console.error(`Failed to enroll admin user "admin": ${error}`);

	}
};
async function registerUser(userName,client,ca_client) {
	try {
    	// first check to see if the user is already enrolled
	    var user = await client.getUserContext(userName, true);
		if (user && user.isEnrolled()) {
			console.log(`An identity for the  user '${userName}' already exists in the wallet`);
			return;
		};
    	var admin_user = await client.getUserContext('admin', true);
    	const userPwd = await ca_client.register({enrollmentID: userName, affiliation: 'org1.department1',role: 'client'}, admin_user)
		const enrollment =  await ca_client.enroll({
          enrollmentID: userName,
          enrollmentSecret: userPwd
        });
        user = await client.createUser({username: userName,
          mspid: userPwd,
          cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
      	});
      	await client.setUserContext(user);
      	console.log(`Successfully register  user ${userName} `);

	} catch (error) {
		console.error(`Failed to register  user ${userName}: ${error}`);

	}
};
async function invoke(userName,client) {
    try {
    	const user = await client.getUserContext(userName, true);
		if (!user) {
			throw new Error('\n\nFailed to get user.... run registerUser.js');
		};
		//1.链接peer
		const peer = client.newPeer('grpcs://localhost:7051', {
			'ssl-target-name-override': 'peer0.org1.example.com',
			pem: fs.readFileSync(certPath, 'utf8')
		});
    	//2.创建通道
    	const channel = client.newChannel('mychannel');
		await channel.initialize({ discover: true, asLocalhost: true, target: peer });
		//3.创建交易ID
		const tx_id = client.newTransactionID();
		const proposal_request = {
			targets: [peer],
			chaincodeId: 'fabcar',
			fcn: 'createCar',
			args: ['CAR12', 'Honda', 'Accord', 'Black', 'Tom'],
			chainId: 'mychannel',
			txId: tx_id
		};
		console.log(proposal_request)
		//5.发送交易
		const results = await channel.sendTransactionProposal(proposal_request);
		console.log(results)


    } catch (error) {
        console.error(`Failed to submit transaction: ${error}`);
        process.exit(1);
    }
}
async function installChaincode(peers, chaincodeName, chaincodePath,
	chaincodeVersion, chaincodeType, username, org_name) {
	// helper.setupChaincodeDeploy();
	try {
		// const client = new Fabric_Client();
		// first setup the client for this org
		const walletPath = path.join(process.cwd(), 'wallet');
		const wallet = new FileSystemWallet(walletPath);
		console.log(`Wallet path: ${walletPath}`);

		// Check to see if we've already enrolled the user.
		const gateway = new Gateway();
        await gateway.connect(ccpPath, { wallet, identity: 'admin', discovery: { enabled: true, asLocalhost: true } });
        const client = gateway.getClient();

		var request = {
			targets: peers,
			chaincodePath: chaincodePath,
			chaincodeId: chaincodeName,
			chaincodeVersion: chaincodeVersion,
			chaincodeType: chaincodeType
		};
		let results = await client.installChaincode(request);
		console.log('results:',results)
		// // the returned object has both the endorsement results
		// // and the actual proposal, the proposal will be needed
		// // later when we send a transaction to the orederer
		// var proposalResponses = results[0];
		// var proposal = results[1];

		// // lets have a look at the responses to see if they are
		// // all good, if good they will also include signatures
		// // required to be committed
		// for (const i in proposalResponses) {
		// 	if (proposalResponses[i] instanceof Error) {
		// 		console.log('install proposal resulted in an error :: %s', proposalResponses[i].toString())
		// 	} else if (proposalResponses[i].response && proposalResponses[i].response.status === 200) {
		// 		console.log('install proposal was good');
		// 	} else {
		// 		console.log('install proposal was bad for an unknown reason %j', proposalResponses[i])
				
		// 	}
		// }
	} catch(error) {
		console.log('********:',error)
	}


};
(async function() {
	const {client,ca_client} = await initClient();
	await enrolleAdmin(client,ca_client);
	await registerUser('user3',client,ca_client);
	await invoke('user3',client);
	// await installChaincode(['peer0.org1.example.com'],'mycc',chaincodePath,'v0','node','admin');
	// let store = 
	// console.log(store)
})()