var q = require('q');

var users = {}, i = 0;

module.exports = function(opt) {
    opt = opt||{};
    opt.load = opt.load || function() {};

    return function(req, res, next) {
        if(!req.user) return next();

        //** a single handler for populating the user object in the request
        var def = q.defer();
        def.promise
            .then(function(userObj) {
                //** set the cached user if not present before returning
                if(!users[req.user.id] && userObj)
                    users[req.user.id] = userObj;

                req.user = users[req.user.id];
                next();
            })
            .fail(function() { next() });

        //** if we've cached the user, grab its reference and return it, otherwise "load" if, if defined
        var user = users[req.user.id];
        user
            ? def.resolve(user)
            : opt.load && opt.load.call(this, def, req, res);
    }
}
