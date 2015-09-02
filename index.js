
// TODO:
// 1) the maths here largely assumes that values are continuous - what about jumps in values
// 2) ignore outliers (both in terms of trip time, and in terms of large deltas)?
// 3) think about strain on time server? maybe randomise schedule updates? (i.e. start at a random time)
// 4) currently, the delta will always be off due to the time taken by the server building the response - account for this?

var TIME_ENDPOINT = 'https://screencloud.herokuapp.com/time?cachebust=';
var UPDATE_INTERVAL = 28800000;     // 8 hours
var NUM_STORED_DELTAS = 5;    // number of previous deltas to store

// the deltas array keeps track of the history of deltas,
// for the sake of averaging
var deltas = new Array(NUM_STORED_DELTAS),
    delta = 0,
    initialised = false;

if (!Date.now) {
    Date.now = function() {
        return (new Date()).getTime();
    };
}

function _parseResponse(text) {

    return parseInt(text, 10);

}

// callback will be called with (err, serverTime, localTimeOfReceipt, roundTripTime)
// assumes server responds with a plain text body containing just the
// current time (as a int of milliseconds since Jan 1st 1970)
function _getServerTime(callback) {

    var req = new XMLHttpRequest(),
        start = 0;

    req.addEventListener('error', callback.bind(null, new Error('Network error.')), false);
    req.addEventListener('abort', callback.bind(null, new Error('Request aborted.')), false);
    req.addEventListener('timeout', callback.bind(null, new Error('Request timeout.')), false);
    req.addEventListener('load', function(e) {

        var serverTime = 0,
            end = Date.now();

        if (req.status !== 200) {
            return callback(new Error('Requested failed with status code: ' + req.status));
        }

        serverTime = _parseResponse(req.responseText);

        // serverTime !== serverTime is a check for NaN
        if (typeof serverTime !== 'number' || serverTime !== serverTime) {
            return callback(new Error('Response can\'t be parsed.'));
        }

        // TODO: check that the returned integer is sensible?

        callback(null, serverTime, end, end - start);


    }, false);

    req.open('GET', TIME_ENDPOINT + Date.now(), true);

    req.timeout = 2000;

    start = Date.now();

    req.send();

}

// updates the deltas array, by pushing a new value onto it
// callback will be called without args when done
function _updateDeltasArray(callback, _tries) {

    if (typeof _tries !== 'number' || _tries < 0) {
        _tries = 0;
    }

    if (_tries > 2) {
        // update failed, but abstract that away from callback
        return callback();
    }

    _getServerTime(function(err, serverTime, receiptTime, tripTime) {

        var newDelta = 0;

        if (err) {
            return _updateDeltasArray(callback, _tries + 1);
        }

        newDelta = serverTime + (tripTime/2) - receiptTime;

        deltas.shift();
        deltas.push(newDelta);

        callback();

    });

}

function _calcDelta() {

    var sum = 0,
        num = 0;

    for (var i=0, l=deltas.length; i<l; i++) {
        if (typeof deltas[i] === 'number') {
            sum += deltas[i];
            num++;
        }
    }

    // avoid divide by zero
    num = num || 1;

    delta = parseInt(sum/num, 10);

}

function getTime() {

    return Date.now() + delta;

}

function getDelta() {

    return delta;

}

function syncTime(callback) {

    var count = deltas.length;

    function checkIfFinished() {

        count--;

        if (count) {
            return;
        }

        _calcDelta();

        if (typeof callback === 'function') {
            callback();
        }

    }

    // reset deltas
    deltas = new Array(NUM_STORED_DELTAS);

    for (var i=0, l=deltas.length; i<l; i++) {
        _updateDeltasArray(checkIfFinished);
    }

}

function init(callback) {

    if (!initialised) {
        // get a new value every 8 hours
        setInterval(function() {

            _updateDeltasArray(_calcDelta);

        }, UPDATE_INTERVAL);
    }

    initialised = true;

    syncTime(callback);

}

module.exports = {
    getTime: getTime,
    getDelta: getDelta,
    syncTime: syncTime,
    init: init
};
