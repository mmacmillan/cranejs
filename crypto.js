/*
 | crypto.js
 | ----
 | some basic, general, crypto functions; requires the dev to provide the base salt when getting the root object
 |
*/

var crypto = require('crypto');

//** provides an instance of the crypto module using the provided base salt
module.exports = function(baseSalt) {
    var lib = {
        //** generates sha1 and sha256 hashes, with the option to specify encoding, defaulting to hex
        sha1: function(data, encoding) {
            return crypto.createHash('sha1').update(data).digest(encoding||'hex');
        },
        sha256: function(data, encoding) {
            return crypto.createHash('sha256').update(data).digest(encoding||'hex');
        },

        //** creates a hash for a password using a salt and key strengthening, using the default encoding 'hex'
        password: function(text, hashFn, salt) {
            salt = salt||baseSalt;
            hashFn = hashFn||lib.sha256; //** default the password hash function to sha256

            var hash = text + salt;
            for(var i=0;i<100;i++) //** hash & re-hash the text and salt 100x to strenthen it
                hash = hashFn(hash + text + salt);
            
            return hash;
        },

        aesEncrypt: function(data, encoding) {
            encoding = encoding||'base64';
            var cipher = crypto.createCipher('aes-256-cbc', baseSalt);
            var encpw = cipher.update(data, 'utf8', encoding);
            return (encpw += cipher.final(encoding));
        },

        aesDecrypt: function(data, encoding) {
            var decipher = crypto.createDecipher('aes-256-cbc', baseSalt);
            var pw = decipher.update(data, encoding||'base64', 'utf8');
            return (pw += decipher.final('utf8'));
        }
    } 

    return lib;
}
