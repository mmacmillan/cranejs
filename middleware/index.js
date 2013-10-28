//** consolidate the middleware so they can be included at once
module.exports = exports = {
    authentication: require('./authentication'),
    errorHandler: require('./errorHandler'),
    fauxvIcon: require('./favIcon'),
    less: require('./less'),
    userCache: require('./userCache'),
    cors: require('cors') //** https://npmjs.org/package/cors
}
