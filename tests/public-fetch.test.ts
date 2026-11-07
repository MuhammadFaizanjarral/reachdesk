import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicAddress,resolvePublicDestination} from '../lib/public-fetch.ts';

test('audit networking rejects private, metadata, reserved, and mapped addresses',()=>{
 for(const address of ['0.0.0.0','10.1.2.3','127.0.0.1','100.64.0.1','169.254.169.254','172.31.4.5','192.168.1.1','192.0.0.1','192.0.2.1','198.18.0.1','198.51.100.2','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','fc00::1','fe80::1','ff02::1','2001:db8::1','2002:7f00:1::1'])assert.equal(isPublicAddress(address),false,address);
 for(const address of ['1.1.1.1','8.8.8.8','93.184.216.34','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(isPublicAddress(address),true,address);
});
test('public-looking local domains cannot cause an audit socket to connect privately',async()=>{
 await assert.rejects(resolvePublicDestination('localhost'),/non-public/);
});
test('aborted DNS lookups do not continue the audit workflow',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(resolvePublicDestination('example.com',controller.signal),{name:'AbortError'});
});
