/*
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { Contract } = require('fabric-contract-api');
const ClientIdentity = require('fabric-shim').ClientIdentity;

class Company extends Contract {

    async initLedger(ctx) {
        console.info('============= START : Initialize Ledger ===========');
        const leve = {

        }
        const coms = [
            {
                name: '阿里巴巴',
                balance: '4142.74',
                code: 'BABA'
            },
            {
                name: '新浪',
                balance: '79.81',
                code: 'SINA'
            },

        ];
        //
        for (let i = 0; i < coms.length; i++) {
             
            coms[i].level = getLevel(coms[i].balance);
            await ctx.stub.putState(coms[i].code, Buffer.from(JSON.stringify(coms[i])));
            console.info('Added <--> ', coms[i]);
        }
        console.info('============= END : Initialize Ledger ===========');
    }

    async queryCom(ctx, code) {
        const comBytes = await ctx.stub.getState(code); // get the comany from chaincode state
        if (!comBytes || comBytes.length === 0) {
            throw new Error(`${code} does not exist`);
        }
        console.info(code,comBytes)
        return comBytes.toString();
    }

    async addCom(ctx, code, name, balance) {
        console.info('============= START : Add Come ===========');
        console.info(balance);

        const company = {
            code,
            name,
            balance,
            level:getLevel(balance.bance)
        };

        await ctx.stub.putState(code, Buffer.from(JSON.stringify(company)));
        console.info('============= END : Add com ===========');
        testClientIdentity(new ClientIdentity(ctx.stub))
    }

    async queryAllComs(ctx) {
        const startKey = '';
        const endKey = '';

        const iterator = await ctx.stub.getStateByRange(startKey, endKey);

        const allResults = [];
        while (true) {
            const res = await iterator.next();

            if (res.value && res.value.value.toString()) {
                console.log(res.value.value.toString('utf8'));

                const Key = res.value.key;
                let Record;
                try {
                    Record = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    console.log(err);
                    Record = res.value.value.toString('utf8');
                }
                allResults.push({ Key, Record });
            }
            if (res.done) {
                console.log('end of data');
                await iterator.close();
                console.info(allResults);
                return JSON.stringify(allResults);
            }
        }
    }

    async changeBalance(ctx, code, newBalance) {
        console.info('============= START : changeBalance ===========');

        const comBytes = await ctx.stub.getState(code); // get the company from chaincode state
        if (!comBytes || comBytes.length === 0) {
            throw new Error(`${code} does not exist`);
        }
        const com = JSON.parse(comBytes.toString());
        com.balance = newBalance;

        await ctx.stub.putState(code, Buffer.from(JSON.stringify(com)));
        console.info('============= END : changeBalance ===========');
    }

}
function testClientIdentity(identity){
    console.info('============= START : testClientIdentity ===========');
    console.log(identity.getMSPID());
    console.log(identity.getX509Certificate());
    console.log(identity.getMSPID());
    console.info('============= END : testClientIdentity ===========');

}
function getLevel(balance){
    var num = parseInt(balance) / 1000;
    var level = '';
    for (var i = 0; i < num; i++) {
        level += 'S';
    }
    console.log(level);
    return level;
}
module.exports = Company;
