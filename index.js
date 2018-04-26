var fs = require('fs');
var https = require('https');
var crypto = require('crypto');
var reids = require('redis');

var NONCESTR_MAX = 32;
var GET_TICKET_URL = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket?type=jsapi&access_token=';
var GET_TICKET_URL_CORP = 'https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=';

/**
 * 票据
 */
var TYPE_TICKET = 1;
/**
 * TOKEN
 */
var TYPE_TOKEN = 2;


if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}

/**
 * 配置项
 */
var options = {
    corp: false,                                            // 是否企业号
    nonceStrLength: 16,                                     // 随机字符串长度，最长32位
    type: 'file',                                           // ticket和token持久化类型，默认file，可选redis
    redisHost: '127.0.0.1',                                 // redis host
    redisPort: 6379,                                        // redis port
    redisAuth: 'your redis password',                       // redis password
    tokenFilename: __dirname + '/local-token.json',
    ticketFilename: __dirname + '/local-ticket.json',

};

/**
 * 票据缓存
 */
var ticketCache = null;
/**
 * token缓存
 */
var tokenCache = null;

/**
 * redis 客户端
 */
var redisClient = null;

/**
 * 导出中间件
 * @param {object} option 
 */
module.exports = function (option) {
    if (!option.hasOwnProperty('appId') || !option.hasOwnProperty('secret')) {
        throw new Error('appId and secert must be provided!');
    }
    options = Object.assign(options, option);

    // 票据token储到redis
    if ('redis' === options.type) {
        var conf = {
            host: options.redisHost,
            port: options.redisPort,
        };
        if (options.redisAuth) conf.password = options.redisAuth;
        redisClient = reids.createClient(conf);
        redisClient.on("error", (err) => {
            console.log("redis error:", err.message);
        });
        redisClient.on('connect', () => {
            console.log('redis connected to the server:', redisClient.connection_id);
        });
    }

    return function (req, res, next) {
        var url = (req.query && req.query.url) || (req.body && req.body.url);
        sign(url, ret => {
            res.json(ret);
        });
    }
}

function createNonceStr(length) {
    length = length || 16;
    length = length > NONCESTR_MAX ? NONCESTR_MAX : length;

    var str = '';
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < length; i++) {
        str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
}

function getAccessToken(cb) {
    readTokenOrTicket(options.type, TYPE_TOKEN, (err, data) => {
        if (err || !data || !data.accessToken || data.expireTime < Date.now()) {
            // 如果是企业号用以下URL获取access_token
            var url = '';
            if (options.corp) {
                url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + options.appId + '&corpsecret=' + options.secret;
            } else {
                url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + options.appId + '&secret=' + options.secret;
            }
            https.get(url, res => {
                res.on('data', d => {
                    data = {};
                    var ret = JSON.parse(d);
                    data.accessToken = ret.access_token;
                    data.expireTime = Date.now() + 7000000;
                    cb(null, data.accessToken);
                    saveTokenOrTicket(options.type, TYPE_TOKEN, data);
                });
            }).on('error', e => {
                cb(e, null);
            });
        } else {
            cb(null, data.accessToken);
        }
    });
}

function getJsApiTicket(cb) {
    readTokenOrTicket(options.type, TYPE_TICKET, (err, data) => {
        if (err || !data || !data.expireTime || data.expireTime < Date.now()) {
            getAccessToken((err, token) => {
                if (err) {
                    cb(err, null)
                }
                https.get(options.corp ? GET_TICKET_URL_CORP + token : GET_TICKET_URL + token, res => {
                    res.on('data', d => {
                        data = {};
                        var ret = JSON.parse(d);
                        data.ticket = ret.ticket;
                        data.expireTime = Date.now() + 7000000;
                        cb(null, data.ticket);
                        saveTokenOrTicket(options.type, TYPE_TICKET, data);
                    });
                }).on('error', e => {
                    cb(err, null)
                })
            });
        } else {
            cb(null, data.ticket);
        }
    });
}

function sign(url, cb) {
    if (!url) {
        throw new Error('argument url must be provided!');
    }
    getJsApiTicket((err, ticket) => {
        if (err) {
            throw err;
        }

        var timestamp = Math.floor(Date.now() / 1000);
        var nonceStr = createNonceStr(options.nonceStrLength);
        var signStr = 'jsapi_ticket=' + ticket + '&noncestr=' + nonceStr + '&timestamp=' + timestamp + '&url=' + url;

        var signature = crypto.createHash('sha1').update(signStr).digest('hex');

        cb({
            appId: options.appId,
            nonceStr,
            timestamp,
            url,
            signature
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
function saveTokenOrTicket(saveType, tokenOrTicket, data) {
    if ('redis' === saveType) {
        if (!redisClient.connected) callback(new Error('redis disconnected'), null);
        var key = tokenOrTicket === TYPE_TICKET ? REDIS_KEY_TICKET : REDIS_KEY_TOKEN;
        redisClient.set(key, JSON.stringify(data));
    } else {
        var fileName = tokenOrTicket === TYPE_TICKET ? options.ticketFilename : options.tokenFilename;
        fs.writeFile(fileName, JSON.stringify(data), err => {
            if (err) {
                console.error('Save to File (' + fileName + ') Error:', err.message);
            }
        });
    }
}

var REDIS_KEY_TOKEN = 'jssdk.token';
var REDIS_KEY_TICKET = 'jssdk.ticket';

/**
 * 读取缓存的票据token
 * @param {string} saveType [file, redis]
 * @param {number} tokenOrTicket 
 * @param {function} callback 
 */
function readTokenOrTicket(saveType, tokenOrTicket, callback) {
    if ('redis' === saveType) {
        if (!redisClient.connected) callback(new Error('redis disconnected'), null);
        var key = tokenOrTicket === TYPE_TICKET ? REDIS_KEY_TICKET : REDIS_KEY_TOKEN;
        redisClient.get(key, (err, reply) => {
            if (err) {
                callback(err, reply);
            } else {
                var ret;
                try {
                    ret = JSON.parse(reply.toString());
                } catch (error) {
                    console.log(error.message);
                }
                callback(err, ret);
            }
        });
    } else {
        var fileName = tokenOrTicket === TYPE_TICKET ? options.ticketFilename : options.tokenFilename;
        fs.readFile(fileName, (err, data) => {
            if (err) {
                callback(err, data)
            } else {
                var ret;
                try {
                    ret = JSON.parse(data.toString());
                } catch (error) {
                    console.log(error.message);
                }
                callback(err, ret);
            }
        });
    }
}