var _ = require( 'lodash' );

var Edits = module.exports = function Edits(initialValue) {
    this.origValue = initialValue;
    this.edits = [];
};

function reverse(s) {
    var r = "", i = s.length;
    while( i-- ) {
        r += s[i];
    }
    return r;
}

function findIndent( code, pos ) {
    var indent = [], p = pos, ch;
    while( --p > 0 ) {
        ch = code.charAt( p );
        if( '\t '.indexOf( ch ) !== -1 ) {
            indent.push(ch);
        }
        else if( '\r\n'.indexOf( ch ) !== -1 ) {
            break;
        }
        else {
            indent = [];
        }
    }

    return indent.reverse().join( "" );
}

Edits.prototype.hasEdits = function() {
    return this.edits.length > 0;
};

Edits.prototype.apply = function applyEdits() {

    if( this.edits.length === 0 ) {
        return this.origValue;
    }

    var edits = this.edits,
        code = "" + this.origValue;

    edits.sort( function( a, b ) {
        return a.pos - b.pos;
    } );

    var buffers = [], i = -1, len = edits.length, lastPos = 0;
    var nextPos = {
        'insert': 'pos',
        'replace': 'afterPos'
    };

    while( ++i < len ) {
        var edit = edits[i];
        buffers.push( code.substring( lastPos, edit.pos ) );
        buffers.push( edit.content );

        lastPos = edit[ nextPos[edit.type] || 'pos' ];
    }

    if( lastPos < code.length ) {
        buffers.push( code.substring( lastPos, code.length ) );
    }

    return buffers.join( "" );
};

Edits.prototype.replace = function( firstIndex, afterIndex, replaceWith ) {
    this.edits.push( { type: 'replace', pos: firstIndex, afterPos: afterIndex, content: replaceWith } );
};

Edits.prototype.insert = function( str, beforeIndex, indent ) {
    if( _.isArray( str ) ) {
        str.forEach( function(a) {
            this.insert.apply( this, a );
        }, this );
    }
    else if( _.isObject( str ) ) {
        // expect key=insert position,
        // value = string.
        this.insert( str.str, str.pos, str.indent );
    }
    else if( _.isString( str ) ) {
        var len = str.length, i = -1;
        if( indent ) {
            var indentStr = findIndent( this.origValue, beforeIndex );

            if( indent === "after" ) {
                // indent after means we're most likely adding text at the beginning of a line.
                str += indentStr;
            }
            else {
                // indent before means we're most likely adding text at the end of a line.
                // insert any leading newlines, then indent, then reset of text.
                while( ++i < len ) {
                    if( "\n\r".indexOf( str[i] ) === -1 ) {
                        break;
                    }
                }
                str = str.substring( 0, i ) + indentStr + str.substring( i );
            }
        }

        this.edits.push( { type: 'insert', pos: beforeIndex, content: str } );
    }
    else {
        throw Error( "Unexpected parameters: " + arguments.toString() );
    }
};