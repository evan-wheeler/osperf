function flatten(arr) { 
    var numItems = arr.length, i = -1, rtn = [], rIndex = 0;
    while( ++i < numItems ) {
        var a = arr[i], j = -1, aLen = a.length;
        while( ++j < aLen ) {
            rtn[rIndex++] = a[j];
        }
    }
    return rtn;
}

function indexOf( array, value, fromIndex ) {
    var index = (fromIndex || 0) - 1,
        length = array ? array.length : 0;

    while (++index < length) {
      if (array[index] === value) {
        return index;
      }
    }
    return -1;
}

function unique(arr) {
    if( arr.unique ) {
        return arr.unique();
    }
    var i = -1, result = [], arrLen = arr.length, v;
    while( ++i < arrLen ) { 
        v = arr[i];
        if( indexOf( result, v ) < 0 ) {
            result.push( v );
        }
    }
    return result;
}

function union() { 
    return unique( flatten( arguments ) );
}

function compact(array) {
    var index = -1,
        length = array ? array.length : 0,
        result = [];

    while (++index < length) {
        var value = array[index];
        if (value) result.push(value);
    }
    return result;
}

var isArray = Array.isArray || function(arg) {
    return Object.prototype.toString.call(arg) === '[object Array]';
};

module.exports = { 
    union: union,
    unique: unique,
    indexOf: indexOf,
    flatten: flatten,
    isArray: isArray,
    compact: compact
};