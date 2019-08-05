'use strict';

const FabricCAServices = require('fabric-ca-client');
const {
	FileSystemWallet,
	Gateway,
	X509WalletMixin
} = require('fabric-network');
const fs = require('fs');
const path = require('path');

const ccpPath = path.resolve(__dirname, 'connection-org1.json');
const ccpJSON = fs.readFileSync(ccpPath, 'utf8');
const ccp = JSON.parse(ccpJSON);

async function enrolleAdmin() {
	try {

		// Create a new CA client for interacting with the CA.
		const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
		const caTLSCACertsPath = path.resolve(__dirname, caInfo.tlsCACerts.path);
		const caTLSCACerts = fs.readFileSync(caTLSCACertsPath);
		const ca = new FabricCAServices(caInfo.url, {
			trustedRoots: caTLSCACerts,
			verify: false
		}, caInfo.caName);

		// Create a new file system based wallet for managing identities.
		const walletPath = path.join(process.cwd(), 'wallet');
		const wallet = new FileSystemWallet(walletPath);
		console.log(`Wallet path: ${walletPath}`);

		// Check to see if we've already enrolled the admin user.
		const adminExists = await wallet.exists('admin');
		if (adminExists) {
			console.log('An identity for the admin user "admin" already exists in the wallet');
			return;
		}

		// Enroll the admin user, and import the new identity into the wallet.
		const enrollment = await ca.enroll({
			enrollmentID: 'admin',
			enrollmentSecret: 'adminpw'
		});
		const identity = X509WalletMixin.createIdentity('Org1MSP', enrollment.certificate, enrollment.key.toBytes());
		await wallet.import('admin', identity);
		console.log('Successfully enrolled admin user "admin" and imported it into the wallet');

	} catch (error) {
		console.error(`Failed to enroll admin user "admin": ${error}`);

	}
};
async function registerUser(userName) {
	try {

		// Create a new file system based wallet for managing identities.
		const walletPath = path.join(process.cwd(), 'wallet');
		const wallet = new FileSystemWallet(walletPath);
		console.log(`Wallet path: ${walletPath}`);

		// Check to see if we've already enrolled the user.
		const userExists = await wallet.exists(userName);
		if (userExists) {
			console.log('An identity for the user "user1" already exists in the wallet');
			return;
		}

		// Check to see if we've already enrolled the admin user.
		const adminExists = await wallet.exists('admin');
		if (!adminExists) {
			console.log('An identity for the admin user "admin" does not exist in the wallet');
			console.log('Run the enrollAdmin.js application before retrying');
			return;
		}

		// Create a new gateway for connecting to our peer node.
		const gateway = new Gateway();
		await gateway.connect(ccpPath, {
			wallet,
			identity: 'admin',
			discovery: {
				enabled: true,
				asLocalhost: true
			}
		});

		// Get the CA client object from the gateway for interacting with the CA.
		const ca = gateway.getClient().getCertificateAuthority();
		const adminIdentity = gateway.getCurrentIdentity();

		// Register the user, enroll the user, and import the new identity into the wallet.
		const secret = await ca.register({
			affiliation: 'org1.department1',
			enrollmentID: userName,
			role: 'client'
		}, adminIdentity);
		const enrollment = await ca.enroll({
			enrollmentID: userName,
			enrollmentSecret: secret
		});
		const userIdentity = X509WalletMixin.createIdentity('Org1MSP', enrollment.certificate, enrollment.key.toBytes());
		await wallet.import(userName, userIdentity);
		console.log('Successfully registered and enrolled admin user "user1" and imported it into the wallet');

	} catch (error) {
		console.error(`Failed to register user "user1": ${error}`);
		process.exit(1);
	}
};
async function invoke(userName) {
    try {

        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(__dirname, 'wallet');
        const wallet = new FileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the user.
        const userExists = await wallet.exists(userName);
        if (!userExists) {
            console.log('An identity for the user "user1" does not exist in the wallet');
            console.log('Run the registerUser.js application before retrying');
            return;
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        await gateway.connect(ccpPath, { wallet, identity: userName, discovery: { enabled: true, asLocalhost: true } });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('mychannel');

        // Get the contract from the network.
        const contract = network.getContract('fabcar');

        // Submit the specified transaction.
        // createCar transaction - requires 5 argument, ex: ('createCar', 'CAR12', 'Honda', 'Accord', 'Black', 'Tom')
        // changeCarOwner transaction - requires 2 args , ex: ('changeCarOwner', 'CAR10', 'Dave')
        await contract.submitTransaction('createCar', 'CAR12', 'Honda', 'Accord', 'Black', 'Tom');
        console.log('Transaction has been submitted');

        // Disconnect from the gateway.
        await gateway.disconnect();

    } catch (error) {
        console.error(`Failed to submit transaction: ${error}`);
        process.exit(1);
    }
}
(async function() {
	// await enrolleAdmin();
	// await registerUser('qiqi');
	await invoke('qiqi');
})()