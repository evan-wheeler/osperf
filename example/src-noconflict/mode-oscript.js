ace.define("ace/mode/oscript_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var OScriptHighlightRules = function() {

    // regexp must not have capturing parentheses. Use (?:) instead.
    // regexps are ordered -> the first match is used

    this.$rules = {
    "start": [
        {
            token: [
                "meta.ending-space"
            ],
            regex: "$"
        },
        {
            token: [
                null
            ],
            regex: "^(?=\\t)",
            next: "state_3"
        },
        {
            token: [null],
            regex: "^(?= )",
            next: "state_4"
        },
        {
            token: "punctuation.definition.comment.asp",
            regex: "//",
            next: "comment"
        },
        {
            token: "punctuation.definition.comment.asp",
            regex: "\\/\\*",
            next: "block_comment"
        },
        {
            token: [
                "keyword.control.asp"
            ],
            regex: /\b(?:Function|Goto|If|Then|Else|ElseIf|End|While|For|To|DownTo|In|Case|Switch|Default|Return|Continue|ContinueIf|Break|Repeat|Until)\b/,
            caseInsensitive: true
        },
        { 
            token: "keyword.operator.asp",
            regex: "\\b(?:And|Or)\\b"
        },
        {
            token: "storage.type.asp",
            regex: "\\b(?:Void|Assoc|Bytes|Boolean|CapiConnect|CacheTree|Date|Dynamic|DAPINode|DAPISession|DAPIVersion|DAPIStream|DOMAttr|DOMCDATASection|DOMCharacterData|DOMComment|DOMDocument|DOMDocumentFragment|DOMDocumentType|DOMElement|DOMEntity|DOMEntityReference|DOMImplementation|DOMNamedNodeMap|DOMNode|DOMNodeList|DOMNotation|DOMParser|DOMProcessingInstruction|DOMText|Error|File|FileCopy|FilePrefs|Frame|Integer|JavaObject|List|Long|MailMessage|Object|ObjRef|Pattern|PatFind|PatChange|Real|RegEx|Record|RecArray|String|UAPISESSION|UAPIUSER|ULong|WAPISESSION|WAPIMAP|WAPIMAPTASK|WAPIWORK|WAPISUBWORK|SAXParser|XSLProcessor)\\b",
            caseInsensitive: true
        },
        {
            token: "constant.language.asp",
            regex: "\\b(?:False|Undefined|True)\\b"
        },
        {
            token: "punctuation.definition.string.begin.asp",
            regex: '"',
            next: "string"
        },
        {
            token: "punctuation.definition.sstring.begin.asp",
            regex: "'",
            next: "sstring"
        },
        {
            token: [
                "punctuation.definition.variable.asp"
            ],
            regex: "(\\$)[a-zA-Z_x7f-xff][a-zA-Z0-9_x7f-xff]*?\\b\\s*"
        },
        {
            token: [
                "constant.numeric.asp"
            ],
            regex: "-?\\b(?:(?:0(?:x|X)[0-9a-fA-F]*)|(?:(?:[0-9]+\\.?[0-9]*)|(?:\\.[0-9]+))(?:(?:e|E)(?:\\+|-)?[0-9]+)?)(?:L|l|UL|ul|u|U|F|f)?\\b"
        },
        {
            token: [
                "entity.name.function.asp"
            ],
            regex: "(?:(\\b[a-zA-Z_x7f-xff][a-zA-Z0-9_x7f-xff]*?\\b)(?=\\(\\)?))"
        },
        {
            token: [
                "keyword.operator.asp"
            ],
            regex: "\\~|\\+\\=|\\-\\=|\\^\\^|\\&\\&|\\|\\||\\-|\\+|\\*\\\/|\\>|\\<|\\=|\\&"
        }
    ],
    "state_3": [
        {
            token: [
                "meta.odd-tab.tabs",
                "meta.even-tab.tabs"
            ],
            regex: "(\\t)(\\t)?"
        },
        {
            token: "meta.leading-space",
            regex: "(?=[^\\t])",
            next: "start"
        },
        {
            token: "meta.leading-space",
            regex: ".",
            next: "state_3"
        }
    ],
    "state_4": [
        {
            token: ["meta.odd-tab.spaces", "meta.even-tab.spaces"], 
            regex: "(  )(  )?"
        },
        {
            token: "meta.leading-space",
            regex: "(?=[^ ])", 
            next: "start"
        },
        {
            defaultToken: "meta.leading-space"
        }
    ],
    "comment": [
        {
            token: "comment.line.asp",
            regex: "$|(?=(?:%>))",
            next: "start"
        },
        {
            defaultToken: "comment.line.asp"
        }
    ],
    "block_comment": [
        {
            token: "comment.block.asp",
            regex: "\\*\\/",
            next: "start"
        },
        {
            defaultToken: "comment.block.asp"
        }
    ],
    "sstring": [
        {
            token: "string.quoted.single.asp",
            regex: "''"
        },
        {
            token: "string.quoted.single.asp",
            regex: "'",
            next: "start"
        },
        {
            defaultToken: "string.quoted.single.asp"
        }
    ],
    "string": [
        {
            token: "string.quoted.double.asp",
            regex: '""'
        },
        {
            token: "string.quoted.double.asp",
            regex: '"',
            next: "start"
        },
        {
            defaultToken: "string.quoted.double.asp"
        }
    ]
}

};

oop.inherits(OScriptHighlightRules, TextHighlightRules);

exports.OScriptHighlightRules = OScriptHighlightRules;
});

ace.define("ace/mode/oscript",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/oscript_highlight_rules"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var OScriptHighlightRules = require("./oscript_highlight_rules").OScriptHighlightRules;

var Mode = function() {
    this.HighlightRules = OScriptHighlightRules;
};
oop.inherits(Mode, TextMode);

(function() {
    this.$id = "ace/mode/oscript";
}).call(Mode.prototype);

exports.Mode = Mode;
});
