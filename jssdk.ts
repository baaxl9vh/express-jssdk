import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import redis, { ClientOpts, RedisClient } from 'redis';

/**
 * 持久化
 * 1. file，保存到文件上
 * 2. redis，保存到redis
 * 3. 不保存
 */
type SaveType = 'file' | 'redis' | 'none';

/**
 * 配置项
 */
interface IJSSDKOptions {
  /**
   * 是否企业号，默认false
   */
  corp?: boolean;
  /**
   * 公众号appId
   */
  appId: string;
  /**
   * 公众号secret
   */
  secret: string;
  /**
   * 随机字符串长度，最长32位，默认16位
   */
  nonceStrLength?: number;
  /**
   * ticket和token持久化类型，默认none，可选redis、file
   */
  type?: SaveType;
  /**
   * redis host，type = redis时，必须提供
   */
  redisHost?: string;
  /**
   * redis port，type = redis时，必须提供
   */
  redisPort?: number;
  /**
   * redis password
   */
  redisAuth?: string;
  /**
   * token 缓存文件，type = file时，必须提供
   */
  tokenFilename?: string;
  /**
   * ticket 缓存文件，type = file时，必须提供
   */
  ticketFilename?: string;
  /**
   * 是否缓存在进程内存，默认true
   */
  cache?: boolean;
  /**
   * 打开调试，默认false
   */
  debug?: boolean;
}

interface ITokenData {
  accessToken?: string;
  ticket?: string;
  expireTime: number;
}

type Callback = (err: Error | null, ret: ITokenData | null) => void;

interface ISignResult {
  /**
   * error code
   * 1. 4001，需要签名的url参数没有提供
   * 2. 内部获取jssdk api ticket错误
   * 3. 0正常签名
   */
  errCode: 4001 | 4002 | 0;
  msg?: string;
  appId?: string;
  nonceStr?: string;
  timestamp?: number;
  url?: string;
  signature?: string;
}

interface IExpressResponse {
  json: (body?: any) => void;
}
interface IExpressRequest {
  query: any;
  body: any;
}

const TAG = 'express-jssdk';

const NONCE_STR_MAX = 32;
const GET_TICKET_URL = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket?type=jsapi&access_token=';
const GET_TICKET_URL_CORP = 'https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=';

/**
 * 票据
 */
const TYPE_TICKET = 1;
/**
 * TOKEN
 */
const TYPE_TOKEN = 2;

/**
 * 配置项
 */
const defOptions: IJSSDKOptions = {
  corp: false,                                            // 是否企业号
  appId: '',
  secret: '',
  nonceStrLength: 16,                                     // 随机字符串长度，最长32位
  type: 'none',                                           // ticket和token持久化类型，默认none，可选file、redis
  redisHost: '127.0.0.1',                                 // redis host
  redisPort: 6379,                                        // redis port
  tokenFilename: __dirname + '/local-token.json',
  ticketFilename: __dirname + '/local-ticket.json',
  cache: true,
  debug: false,
};

/**
 * 票据缓存
 */
const ticketCache: ITokenData = {
  expireTime: 0,
  ticket: '',
};
/**
 * token缓存
 */
const tokenCache: ITokenData = {
  expireTime: 0,
  accessToken: '',
};

/**
 * redis 客户端
 */
let redisClient: RedisClient;

let options: IJSSDKOptions;

/**
 * 导出中间件
 * @param {object} _options
 */
const jssdk = (_options: IJSSDKOptions) => {
  if (!_options.appId || !_options.secret) {
    throw new Error('appId and secret must be provided!');
  }
  if (_options.type === 'file' && (!_options.tokenFilename || !_options.ticketFilename)) {
    throw new Error('if type = file, tokenFilename and ticketFilename must be provided!');
  }
  if (_options.type === 'redis' && (!_options.redisHost || !_options.redisPort)) {
    throw new Error('if type = redis, redis config must be provided!');
  }
  options = Object.assign({}, defOptions, _options);

  // 兼容上个版本，修正type = mem为type = none
  if ('mem' === options.type as string) { options.type = 'none'; }

  // type 设置为 none时，强制使用进程内存
  if ('none' === options.type) { options.cache = true; }

  // reset cache
  ticketCache.expireTime = 0;
  ticketCache.ticket = '';
  tokenCache.expireTime = 0;
  tokenCache.accessToken = '';

  // 票据token储到redis
  if ('redis' === options.type) {
    const conf: ClientOpts = {
      host: options.redisHost,
      port: options.redisPort,
    };
    if (options.redisAuth) {
      conf.password = options.redisAuth;
    }
    redisClient = redis.createClient(conf);
    redisClient.on('error', (err) => {
      console.error(TAG, 'redis error:', err.message);
      // 连接不上redis时，cache开启
      options.cache = true;
    });
    redisClient.on('connect', () => {
      if (options.debug) { console.log(TAG, 'redis connected to the server:', redisClient.connection_id); }
    });
  }

  return (req: IExpressRequest, res: IExpressResponse) => {
    const url = (req.query && req.query.url) || (req.body && req.body.url);
    sign(url, (ret) => {
      res.json(ret);
    });
  };
};

// const disconnectRedis = () => {
//   if (redisClient.connected) { redisClient.quit(); }
// };

export = jssdk;

function createNonceStr(length: number = 16) {
  length = length || 16;
  length = length > NONCE_STR_MAX ? NONCE_STR_MAX : length;

  let str = '';
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}

function getAccessToken(cb: (err: Error | null, token: string | null) => void) {
  readTokenOrTicket(options.type || 'none', TYPE_TOKEN, (err, data) => {
    if (err || !data || !data.accessToken || data.expireTime < Date.now()) {
      // 如果是企业号用以下URL获取access_token
      let url = '';
      if (options.corp) {
        url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid='
          + options.appId + '&corpsecret=' + options.secret;
      } else {
        url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid='
          + options.appId + '&secret=' + options.secret;
      }
      https.get(url, (res) => {
        res.on('data', (d: Buffer) => {
          const tokenData: ITokenData = {
            accessToken: '',
            expireTime: 0,
          };
          let ret;
          try {
            // 正常 {"access_token":"ACCESS_TOKEN","expires_in":7200}
            // 错误 {"errcode":40013,"errmsg":"invalid appid"}
            ret = JSON.parse(d.toString());
          } catch (error) {
            cb(new Error('get token parse error'), null);
            return;
          }
          if (ret && ret.access_token) {
            tokenData.accessToken = ret.access_token;
            tokenData.expireTime = Date.now() + 7000000;
            cb(null, tokenData.accessToken || '');
            saveTokenOrTicket(options.type || 'none', TYPE_TOKEN, tokenData);
          } else if (ret.errcode) {
            cb(new Error(d.toString()), null);
          } else {
            cb(new Error('No token!'), null);
          }
        });
      }).on('error', (e) => {
        cb(e, null);
      });
    } else {
      cb(null, data.accessToken);
    }
  });
}

function getJsApiTicket(cb: (err: Error | null, ticket: string | null) => void) {
  readTokenOrTicket(options.type || 'none', TYPE_TICKET, (err, data) => {
    if (err || !data || !data.expireTime || data.expireTime < Date.now()) {
      getAccessToken((error, token) => {
        if (error) {
          cb(error, null);
          return;
        }
        https.get(options.corp ? GET_TICKET_URL_CORP + token : GET_TICKET_URL + token, (res) => {
          res.on('data', (d) => {
            const ticketData: ITokenData = {
              ticket: '',
              expireTime: 0,
            };
            let ret;
            try {
              // 正常 {"errcode":0,"errmsg":"ok","ticket":"xx","expires_in":7200}
              ret = JSON.parse(d);
            } catch (error) {
              cb(new Error('get ticket parse error'), null);
              return;
            }
            if (ret && ret.errcode === 0 && ret.ticket) {
              ticketData.ticket = ret.ticket;
              ticketData.expireTime = Date.now() + 7000000;
              cb(null, ret.ticket);
              saveTokenOrTicket(options.type || 'none', TYPE_TICKET, ticketData);
            } else {
              cb(new Error('No ticket!'), null);
            }
          });
        }).on('error', (_httpError: Error) => {
          cb(error, null);
        });
      });
    } else {
      if (data.ticket) {
        cb(null, data.ticket);
      } else {
        cb(new Error('Ticket not Found'), null);
      }
    }
  });
}

function sign(url: string, cb: (ret: ISignResult) => void) {
  if (!url) {
    cb({
      errCode: 4001,
      msg: 'argument url must be provided!',
    });
    return;
  }
  getJsApiTicket((err, ticket) => {
    if (err) {
      cb({
        errCode: 4002,
        msg: err.message,
      });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = createNonceStr(options.nonceStrLength);
    const signStr = 'jsapi_ticket=' + ticket + '&noncestr=' + nonceStr + '&timestamp=' + timestamp + '&url=' + url;

    const signature = crypto.createHash('sha1').update(signStr).digest('hex');

    cb({
      errCode: 0,
      appId: options.appId,
      nonceStr,
      timestamp,
      url,
      signature,
    });
  });
}

/**
 * 保存票据token
 * @param {string} saveType token保存类型file本地文件，redis
 * @param {number} tokenOrTicket
 * @param {object} data
 * @param {string} fileName
 */
function saveTokenOrTicket(saveType: SaveType, tokenOrTicket: number, data: ITokenData) {
  if (options.cache) { refreshCache(tokenOrTicket, data); }
  if ('redis' === saveType) {
    if (!redisClient.connected) {
      console.warn(TAG, 'redis disconnected');
      // redis未建立连接，且未开启缓存，开启缓存并缓存数据
      if (!options.cache) {
        if (options.debug) { console.log(TAG, 'redis disconnected, set cache = true.'); }
        options.cache = true;
        refreshCache(tokenOrTicket, data);
      }
      return;
    }
    const key = tokenOrTicket === TYPE_TICKET ? REDIS_KEY_TICKET : REDIS_KEY_TOKEN;
    redisClient.set(key, JSON.stringify(data));
  } else if ('file' === saveType) {
    const fileName = tokenOrTicket === TYPE_TICKET ? options.ticketFilename : options.tokenFilename;
    if (!fileName) {
      if (!options.cache) {
        if (options.debug) { console.log(TAG, 'type = file and no filename, set cache = true.'); }
        options.cache = true;
        refreshCache(tokenOrTicket, data);
      }
      return;
    }
    fs.writeFile(fileName, JSON.stringify(data), (err) => {
      if (err) {
        // 保存到文件上失败，且未开启缓存，开启缓存并缓存数据
        if (!options.cache) {
          if (options.debug) { console.log(TAG, 'save to file error, set cache = true.'); }
          options.cache = true;
          refreshCache(tokenOrTicket, data);
        }
        console.error(TAG, 'Save to File (' + fileName + ') Error:', err.message);
      }
    });
  }
}

function refreshCache(tokenOrTicket: number, data: ITokenData) {
  if (options.debug) { console.log(TAG, ' refresh cache, TYPE =', tokenOrTicket, 'data =', data); }
  if (tokenOrTicket === TYPE_TICKET) {
    ticketCache.expireTime = data.expireTime;
    ticketCache.ticket = data.ticket;
  } else {
    tokenCache.expireTime = data.expireTime;
    tokenCache.accessToken = data.accessToken;
  }
}

const REDIS_KEY_TOKEN = 'jssdk.token';
const REDIS_KEY_TICKET = 'jssdk.ticket';

/**
 * 读取缓存的票据token
 * @param {string} saveType [file, redis, mem]
 * @param {number} tokenOrTicket
 * @param {function} cb
 */
function readTokenOrTicket(saveType: SaveType, tokenOrTicket: number, cb: Callback) {
  if (options.cache) {
    if (tokenOrTicket === TYPE_TICKET) {
      if (ticketCache && ticketCache.ticket && ticketCache.expireTime > Date.now()) {
        // 内存有缓存
        cb(null, ticketCache);
        if (options.debug) { console.log(TAG, 'readTokenOrTicket: read ticket from cache'); }
        return;
      }
    } else {
      if (tokenCache && tokenCache.accessToken && tokenCache.expireTime > Date.now()) {
        if (options.debug) { console.log(TAG, 'readTokenOrTicket: read token from cache'); }
        cb(null, tokenCache);
        return;
      }
    }
  }
  if ('redis' === saveType) {
    if (!redisClient.connected) {
      if (options.debug) { console.log(TAG, 'readTokenOrTicket: redis disconnected'); }
      cb(new Error('redis disconnected'), null);
      return;
    }
    const key = tokenOrTicket === TYPE_TICKET ? REDIS_KEY_TICKET : REDIS_KEY_TOKEN;
    redisClient.get(key, (err, reply) => {
      if (err) {
        if (options.debug) { console.log(TAG, 'readTokenOrTicket: read redis error =', err.message); }
        cb(err, null);
      } else {
        try {
          cb(err, JSON.parse(reply.toString()) as ITokenData);
          if (options.debug) { console.log(TAG, 'readTokenOrTicket: reply =', reply); }
        } catch (error) {
          if (options.debug) { console.log(TAG, 'readTokenOrTicket: type = redis, parse data  error =', error); }
          cb(error, null);
        }
      }
    });
  } else if ('file' === saveType) {
    const fileName = tokenOrTicket === TYPE_TICKET ? options.ticketFilename : options.tokenFilename;
    if (!fileName) {
      cb(new Error('No filename'), null);
      return;
    }
    fs.readFile(fileName, (err, data) => {
      if (err) {
        if (options.debug) { console.log(TAG, 'readTokenOrTicket: read file error =', err.message); }
        cb(err, null);
      } else {
        try {
          cb(err, JSON.parse(data.toString()) as ITokenData);
          if (options.debug) { console.log(TAG, 'readTokenOrTicket: buffer =', data); }
        } catch (error) {
          if (options.debug) { console.log(TAG, 'readTokenOrTicket: type = file, parse data error =', error); }
          cb(error, null);
        }
      }
    });
  } else {
    // 不是file也不是redis，返回空，让后面逻辑去微信服务器请求
    cb(null, null);
  }
}
