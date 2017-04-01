var fs = require('fs');
var https = require('https');
var crypto = require('crypto');

var NONCESTR_MAX = 32;
var GET_TICKET_URL = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket?type=jsapi&access_token=';
var GET_TICKET_URL_CORP = 'https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=';

if (!Date.now) {
  Date.now = function now() {
    return new Date().getTime();
  };
}

var options = {
    corp: false,            // 是否企业号
    nonceStrLength: 16,     // 随机字符串长度，最长32位
    tokenFilename: __dirname + '/local-token.json',
    ticketFilename: __dirname + '/local-ticket.json'
};

module.exports = function (option) {
    if (!option.hasOwnProperty('appId') || !option.hasOwnProperty('secret')) {
        throw new Error('appId and secert must be provided!');
    }
    options = Object.assign(options, option);
    
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
    for (let i = 0; i < length; i ++) {
        str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
}

function getAccessToken (cb) {
    var data;
    try {
        data = JSON.parse(fs.readFileSync(options.tokenFilename));
    } catch (err) {
        // file not exists
    }
    if (!data || !data.accessToken || data.expireTime < Date.now()) {
        // 如果是企业号用以下URL获取access_token
        var url = '';
        if (options.corp) {
            url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + options.appId + '&corpsecret=' + options.secret;
        } else {
            url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + options.appId + '&secret=' + options.secret;
        }
        https.get(url, res => {
            res.on('data', d => {
                data = data || {};
                var ret = JSON.parse(d);
                data.accessToken = ret.access_token;
                data.expireTime = Date.now() + 7000000;
                cb(null, data.accessToken);
                fs.writeFile(options.tokenFilename, JSON.stringify(data), err => {
                    if (err) {
                        console.error('Save Access Token Error:', err.message);
                    }
                });
            });
        }).on('error', e => {
            cb(e, null);
        });
    } else {
        cb(null, data.accessToken);
    }
}

function getJsApiTicket (cb) {
    var data;
    try {
        data = JSON.parse(fs.readFileSync(options.ticketFilename));
    } catch (err) {
        // file not exists
    }
    if (!data || !data.expireTime || data.expireTime < Date.now()) {
        getAccessToken((err, token) => {
            if (err) {
                cb(err, null)
            }
            https.get(options.corp ? GET_TICKET_URL_CORP + token : GET_TICKET_URL + token, res => {
                res.on('data', d => {
                    data = data || {};
                    var ret = JSON.parse(d);
                    data.ticket = ret.ticket;
                    data.expireTime = Date.now() + 7000000;
                    cb(null, data.ticket);
                    fs.writeFile(options.ticketFilename, JSON.stringify(data), err => {
                        if (err) {
                            console.error('Save Ticket Error:', err.message);
                        }
                    });
                });
            }).on('error', e => {
                cb(err, null)
            })
        });
    } else {
        cb(null, data.ticket);
    }
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