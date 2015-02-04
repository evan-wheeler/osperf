function convertToBase(val,chars) {
    var str = "",
        base = chars.length;
    while( val >= base ) {
        var r = val % base;
        val = Math.floor( val / base );
        str += chars.charAt( r );
    }
    return str + chars.charAt( val );
}

var IDGenerator = module.exports = function( options ) {
    options = options || {};

    if( options.compress !== false ) {
        this.chars = options.chars || "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ;:=?@!~#$%&-_";
    }

    if( options.keep !== false ) {
        this.idMap = {};
    }

    this.index = 0;
};

IDGenerator.prototype.newID = function(arg) {
    var id = this.index++;

    if( this.chars ) {
        id = convertToBase( id, this.chars );
    }

    if( this.idMap && arguments.length ) {
        this.idMap[id] = arg;
    }

    return id;
};

IDGenerator.prototype.getIDs = function() {
    return this.idMap;
};
