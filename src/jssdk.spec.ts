import assert from 'assert';
import chai from 'chai';

import { ISignResult, JSSDKOptions } from '../lib/jssdk';
import JSSDK from './jssdk';

describe('jssdk class', () => {
  const appId = 'wx8372b24417f593f2';
  const secret = 'd649471dad4e9530c2ed7068089d9a82';
  const url = 'http://yourdomain.com/index.html';

  const req = {
    query: {
      url,
    },
    body: {},
  };

  it('createRequestHandler', (done) => {
    const opt: JSSDKOptions = {
      appId,
      secret,
    };
    const handler = JSSDK.createRequestHandler(opt);
    handler(req, {
      json: (body: ISignResult) => {
        assert.equal(body.errCode, 0);
        chai.assert.isUndefined(body.msg);
        chai.assert.isString(body.appId);
        chai.assert.isString(body.nonceStr);
        chai.assert.isString(body.signature);
        chai.assert.isNumber(body.timestamp);
        assert.equal(body.url, url);
        done();
      },
    });
  });
});
