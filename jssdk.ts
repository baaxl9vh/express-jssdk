import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import redis, { ClientOpts, RedisClient } from 'redis';

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
let defaultOptions: ConfigOptions = {
  corp: false,                                            // 是否企业号
  appId: '',
  secret: '',
  nonceStrLength: 16,                                     // 随机字符串长度，最长32位
  type: 'mem',                                           // ticket和token持久化类型，默认file，可选redis
  redisHost: '127.0.0.1',                                 // redis host
  redisPort: 6379,                                        // redis port
  redisAuth: 'your redis password',                       // redis password
  tokenFilename: __dirname + '/local-token.json',
  ticketFilename: __dirname + '/local-ticket.json',

};

/**
 * 票据缓存
 */
const ticketCache: TokenData = {
  expireTime: 0,
  ticket: '',
};
/**
 * token缓存
 */
const tokenCache: TokenData = {
  expireTime: 0,
  accessToken: '',
};

/**
 * redis 客户端
 */
let redisClient: RedisClient;

/**
 * 导出中间件
 * @param {object} option
 */
export const jssdk = (option: ConfigOptions) => {
  if (!option.hasOwnProperty('appId') || !option.hasOwnProperty('secret')) {
    throw new Error('appId and secret must be provided!');
  }
  if (option.type === 'file' && (!option.tokenFilename || !option.ticketFilename)) {
    throw new Error('if type = file, tokenFilename and ticketFilename must be provided!');
  }
  if (option.type === 'redis' && (!option.redisHost || !option.redisPort)) {
    throw new Error('if type = redis, redis config must be provided!');
  }
  defaultOptions = Object.assign(defaultOptions, option);

  // 票据token储到redis
  if ('redis' === defaultOptions.type) {
    const conf: ClientOpts = {
      host: defaultOptions.redisHost,
      port: defaultOptions.redisPort,
    };
    if (defaultOptions.redisAuth) {
      conf.password = defaultOptions.redisAuth;
    }
    redisClient = redis.createClient(conf);
    redisClient.on('error', (err) => {
      console.log('redis error:', err.message);
    });
    redisClient.on('connect', () => {
      console.log('redis connected to the server:', redisClient.connection_id);
    });
  }

  return (req: ExpressRequest, res: ExpressResponse) => {
    const url = (req.query && req.query.url) || (req.body && req.body.url);
    sign(url, (_err, ret) => {
      res.json(ret || {});
    });
  };
};

export default jssdk;

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
  readTokenOrTicket(defaultOptions.type, TYPE_TOKEN, (err, data) => {
    if (err || !data || !data.accessToken || data.expireTime < Date.now()) {
      // 如果是企业号用以下URL获取access_token
      let url = '';
      if (defaultOptions.corp) {
        url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid='
          + defaultOptions.appId + '&corpsecret=' + defaultOptions.secret;
      } else {
        url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid='
          + defaultOptions.appId + '&secret=' + defaultOptions.secret;
      }
      https.get(url, (res) => {
        res.on('data', (d) => {
          const tokenData: TokenData = {
            accessToken: '',
            expireTime: 0,
          };
          try {
            const ret = JSON.parse(d);
            tokenData.accessToken = ret.access_token;
            tokenData.expireTime = Date.now() + 7000000;
            if (tokenData.accessToken) {
              cb(null, tokenData.accessToken);
              saveTokenOrTicket(defaultOptions.type, TYPE_TOKEN, tokenData);
            } else {
              cb(new Error('No token response'), null);
            }
          } catch (error) {
            cb(error, null);
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
  readTokenOrTicket(defaultOptions.type, TYPE_TICKET, (err, data) => {
    if (err || !data || !data.expireTime || data.expireTime < Date.now()) {
      getAccessToken((error, token) => {
        if (error) {
          cb(error, null);
        }
        https.get(defaultOptions.corp ? GET_TICKET_URL_CORP + token : GET_TICKET_URL + token, (res) => {
          res.on('data', (d) => {
            const ticketData: TokenData = {
              ticket: '',
              expireTime: 0,
            };
            try {
              const ret = JSON.parse(d);
              ticketData.ticket = ret.ticket;
              ticketData.expireTime = Date.now() + 7000000;
              if (ticketData.ticket) {
                cb(null, ticketData.ticket);
              } else {
                cb(new Error('No ticket response'), null);
              }
              saveTokenOrTicket(defaultOptions.type, TYPE_TICKET, ticketData);
            } catch (error) {
              cb(error, null);
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

function sign(url: string, cb: SignCallback) {
  if (!url) {
    cb(new Error('argument url must be provided!'), null);
  }
  getJsApiTicket((err, ticket) => {
    if (err) {
      cb(err, null);
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = createNonceStr(defaultOptions.nonceStrLength);
    const signStr = 'jsapi_ticket=' + ticket + '&noncestr=' + nonceStr + '&timestamp=' + timestamp + '&url=' + url;

    const signature = crypto.createHash('sha1').update(signStr).digest('hex');

    cb(null, {
      appId: defaultOptions.appId,
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
function saveTokenOrTicket(saveType: SaveType, tokenOrTicket: number, data: TokenData) {
  refreshCache(tokenOrTicket, data);
  if ('redis' === saveType) {
    if (!redisClient.connected) {
      console.warn('redis disconnected');
      return;
    }
    const key = tokenOrTicket === TYPE_TICKET ? REDIS_KEY_TICKET : REDIS_KEY_TOKEN;
    redisClient.set(key, JSON.stringify(data));
  } else if ('file' === saveType) {
    const fileName = tokenOrTicket === TYPE_TICKET ? defaultOptions.ticketFilename : defaultOptions.tokenFilename;
    if (!fileName) {
      console.log('No filename');
      return;
    }
    fs.writeFile(fileName, JSON.stringify(data), (err) => {
      if (err) {
        console.error('Save to File (' + fileName + ') Error:', err.message);
      }
    });
  }
}

function refreshCache(tokenOrTicket: number, data: TokenData) {
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
 * @param {function} callback
 */
function readTokenOrTicket(saveType: SaveType, tokenOrTicket: number, callback: Callback) {
  if (tokenOrTicket === TYPE_TICKET) {
    if (ticketCache && ticketCache.ticket && ticketCache.expireTime > Date.now()) {
      // 内存有缓存
      callback(null, ticketCache);
      return;
    }
  } else {
    if (tokenCache && tokenCache.accessToken && tokenCache.expireTime > Date.now()) {
      callback(null, tokenCache);
      return;
    }
  }
  if ('redis' === saveType) {
    if (!redisClient.connected) {
      callback(new Error('redis disconnected'), null);
    }
    const key = tokenOrTicket === TYPE_TICKET ? REDIS_KEY_TICKET : REDIS_KEY_TOKEN;
    redisClient.get(key, (err, reply) => {
      if (err) {
        callback(err, null);
      } else {
        try {
          callback(err, JSON.parse(reply.toString()) as TokenData);
        } catch (error) {
          console.log(error.message);
          callback(err, null);
        }
      }
    });
  } else if ('file' === saveType) {
    const fileName = tokenOrTicket === TYPE_TICKET ? defaultOptions.ticketFilename : defaultOptions.tokenFilename;
    if (!fileName) {
      callback(new Error('No filename'), null);
      return;
    }
    fs.readFile(fileName, (err, data) => {
      if (err) {
        callback(err, null);
      } else {
        try {
          callback(err, JSON.parse(data.toString()) as TokenData);
        } catch (error) {
          console.log(error.message);
          callback(err, null);
        }
      }
    });
  } else {
    // 不是file也不是redis，返回空，让后面逻辑去微信服务器请求
    callback(null, null);
  }
}
