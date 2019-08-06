import assert from 'assert';
import chai from 'chai';

import jssdk from './jssdk';
import { Options, Result } from './lib/jssdk';

describe('express-jssdk', () => {

  const appId = 'wx8372b24417f593f2';
  const secret = 'd649471dad4e9530c2ed7068089d9a82';
  const url = 'http://yourdomain.com/index.html';

  const req = {
    query: {
      url,
    },
    body: {},
  };

  describe('no appId or secret', () => {
    it('no appId', () => {
      const options: Options = {
        appId: '',
        secret,
      };
      assert.throws(() => { jssdk(options); }, Error,
        'appId and secret must be provided!');
    });
    it('no secret', () => {
      const options: Options = {
        appId,
        secret: '',
      };
      assert.throws(() => { jssdk(options); }, Error,
        'appId and secret must be provided!');
    });
  });

  describe('type=file', () => {
    it('should return errCode = 0 when filename provided', (done) => {
      const options: Options = {
        appId,
        secret,
        type: 'file',
        tokenFilename: __dirname + '/local-token.json',
        ticketFilename: __dirname + '/local-ticket.json',
      };
      jssdk(options)(req, {
        json: (body: any) => {
          /**
           * {
           *   appId: 'wx8372b24417f593f2',
           *   nonceStr: 'YVaN18qahGXdfC5e',
           *   timestamp: 1565000423,
           *   url: 'http://yourdomain.com/index.html',
           *   signature: '8375d8fc9e8b80768c51b32ae0bcfaba8a0915c1'
           * }
           */
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
    it('should throw error when filename did not provided', () => {
      const options: Options = {
        appId,
        secret,
        type: 'file',
      };
      assert.throws(() => { jssdk(options); }, Error,
        'if type = file, tokenFilename and ticketFilename must be provided!');
    });
  });

  describe('type=redis', () => {
    it('should return errCode = 0 when filename provided', (done) => {
      const options: Options = {
        appId,
        secret,
        type: 'redis',
        redisHost: '192.168.1.7',
        redisPort: 6379,
      };
      const handler = jssdk(options);
      setTimeout(() => {
        // wait for redis
        handler(req, {
          json: (body: any) => {
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
      }, 1000);
    });
    it('should throw error when host and port did not provided', () => {
      const options: Options = {
        appId,
        secret,
        type: 'redis',
      };
      assert.throws(() => { jssdk(options); }, Error,
        'if type = redis, redis config must be provided!');
    });
    after(() => {
      // disconnectRedis();
    });
  });

  describe('type=none', () => {
    it('should return errCode = 0 when only appId and secret provided', (done) => {
      // 只使用缓存方式，每次都要去微信拉token和ticket，延迟比较高
      const options: Options = {
        appId,
        secret,
      };
      jssdk(options)(req, {
        json: (body: Result) => {
          assert.equal(body.errCode, 0);
          chai.assert.isUndefined(body.msg);
          chai.assert.isString(body.appId);
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

  describe('incorrect appId or secret', () => {
    it('incorrect appId', (done) => {
      // 只使用缓存方式，每次都要去微信拉token和ticket，延迟比较高
      const options: Options = {
        appId: 'appId',
        secret,
      };
      jssdk(options)(req, {
        json: (body: Result) => {
          assert.equal(body.errCode, 4002);
          chai.assert.isString(body.msg);
          chai.assert.isUndefined(body.appId);
          chai.assert.isUndefined(body.nonceStr);
          chai.assert.isUndefined(body.signature);
          chai.assert.isUndefined(body.timestamp);
          chai.assert.isUndefined(body.url);
          done();
        },
      });
    });

    it('incorrect secret', (done) => {
      // 只使用缓存方式，每次都要去微信拉token和ticket，延迟比较高
      const options: Options = {
        appId,
        secret: 'secret',
      };
      jssdk(options)(req, {
        json: (body: Result) => {
          assert.equal(body.errCode, 4002);
          chai.assert.isString(body.msg);
          chai.assert.isUndefined(body.appId);
          chai.assert.isUndefined(body.nonceStr);
          chai.assert.isUndefined(body.signature);
          chai.assert.isUndefined(body.timestamp);
          chai.assert.isUndefined(body.url);
          done();
        },
      });
    });
  });

  describe('no url', () => {
    it('no url', (done) => {
      // 只使用缓存方式，每次都要去微信拉token和ticket，延迟比较高
      const options: Options = {
        appId,
        secret,
      };
      jssdk(options)(
        {
          query: {
            url: '',
          },
          body: {},
        },
        {
          json: (body: Result) => {
            assert.equal(body.errCode, 4001);
            assert.equal(body.msg, 'argument url must be provided!');
            chai.assert.isUndefined(body.appId);
            chai.assert.isUndefined(body.nonceStr);
            chai.assert.isUndefined(body.signature);
            chai.assert.isUndefined(body.timestamp);
            chai.assert.isUndefined(body.url);
            done();
          },
        });
    });
  });

});
