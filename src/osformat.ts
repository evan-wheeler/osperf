import * as Bannockburn from "bannockburn";
import _ from "lodash";

interface Location {
    start: LocPos;
    end: LocPos;
}

interface Span {
    value: string;
    p: number;
}

interface LocPos {
    line: number;
    col: number;
}

interface Token {
    type: string;
    value: string;
    range: [number, number];
    loc: Location;
    extra: any;
    double: any;
}

const keywords = [
    "and",
    "or",
    "not",
    "eq",
    "lt",
    "gt",
    "if",
    "elseif",
    "else",
    "for",
    "switch",
    "repeat",
    "while",
    "end",
    "function",
    "until",
    "in",
    "to",
    "downto",
    "default",
    "case",
    "return",
    "break",
    "breakif",
    "continueif",
    "continue"
];

export default class OSFormat {
    code: string;
    parser: any;
    ast: null | any;

    constructor(code: string, ast: null | object) {
        this.code = code;
        this.parser = Bannockburn.Parser({ additional_types: ["GUID"] });
        this.ast = ast;

        if (ast === null) {
            try {
                this.ast = this.parser.parse(this.code);
            } catch (e) {
                console.error(e);
                this.ast = [];
            }
        }
    }

    getAllTokens(): Token[] {
        let tokens = this.parser.getTokens();
        let ws = this.parser.getWhitespace();

        let allTokens = tokens.concat(ws);

        allTokens.sort(function(a: Token, b: Token) {
            return a.range[0] - b.range[0];
        });

        return allTokens;
    }

    getSpansFromStmts(stmts: any[]): Span[] {
        let spans: Span[] = [];

        for (let s of stmts) {
            [].push.apply(spans, s.spans);
        }

        return spans.sort((a: Span, b: Span) => a.p - b.p);
    }

    format(stmts: any[]) {
        const allTokens = this.getAllTokens();
        let i = 0,
            len = allTokens.length;
        let annotatedLines: Map<number, boolean> = new Map<number, boolean>();
        let spans: Span[] = this.getSpansFromStmts(stmts);

        const setTokenProp = (node: Token, value: any, overwrite: boolean = false) => {
            let found = false;

            for (let j = i; j < len; j++) {
                let tok = allTokens[j];
                if (
                    tok.range[0] === node.range[0] &&
                    node.range[1] === node.range[1] &&
                    node.value == tok.value
                ) {
                    if (!tok.extra || overwrite) {
                        tok.extra = value;
                    }

                    found = true;
                    break;
                }
            }

            if (!found) {
                console.log("Token was not found for node: ", node);
            }
        };

        var walker = new Bannockburn.Walker();

        walker
            .on("CallExpression", function(node: any) {
                let annotated = false;
                if (node.callee) {
                    if (
                        node.annotation &&
                        (node.annotation.tag === "nosqlcheck" ||
                            node.annotation.tag === "sqlnocheck")
                    ) {
                        for (
                            let lindex = node.loc.start.line;
                            lindex <= node.loc.end.line;
                            lindex++
                        ) {
                            annotatedLines.set(lindex, true);
                        }
                    }
                    var callee = getASTNode(node.callee);

                    if (callee.type === "MemberExpression") {
                        var memberExpr = callee,
                            obj = getASTNode(memberExpr.object),
                            prop = getASTNode(memberExpr.property);

                        if (!obj || obj.type === "ThisExpression") {
                            if (prop.id === "(name)") {
                                setTokenProp(
                                    prop,
                                    { type: "MemberCall", callType: "this", annotated: annotated },
                                    true
                                );
                            }
                        } else if (!memberExpr.computed) {
                            setTokenProp(
                                prop,
                                { type: "MemberCall", callType: "normal", annotated: annotated },
                                true
                            );
                        }
                    } else if (callee.id === "(name)") {
                        setTokenProp(callee, { type: "FunctionCall", annotated: annotated }, true);
                    }
                }
            })
            .on("FunctionDeclaration", function(node: any) {
                var rtnType = getASTNode(node.dataType);
                if (rtnType) {
                    setTokenProp(rtnType, { type: "VariableType" }, false);
                }
                if (
                    node.annotation &&
                    (node.annotation.tag === "nosqlcheck" || node.annotation.tag === "sqlnocheck")
                ) {
                    for (let lindex = node.loc.start.line; lindex <= node.loc.end.line; lindex++) {
                        annotatedLines.set(lindex, true);
                    }
                }

                if (node.params) {
                    node.params.forEach(function(p: any) {
                        if (p.dataType) {
                            setTokenProp(getASTNode(p.dataType), { type: "VariableType" }, false);
                        }
                    });
                }
                if (node.nameToken) {
                    setTokenProp(node.nameToken, { type: "FunctionDeclaration" }, false);
                }
            })
            .on("VariableDeclaration", function(node: any) {
                var declType = getASTNode(node.declType);
                setTokenProp(declType, { type: "VariableType" }, false);
            })
            .on("MemberExpression", function(node: any) {
                let prop = getASTNode(node.property);

                if (!prop.computed) {
                    setTokenProp(prop, { type: "PropertyName" }, false);
                }
            })
            .start(this.ast);

        var formatted = [
                "<div class='ace-chrome'><div class='ace_static_highlight' style='counter-reset:ace_line'>"
            ],
            curLine = new LineFormatter(spans);

        var processCommentBlock = (v: string, k: number, a: Array<any>) => {
            if (k === 0) {
                // first line
                curLine.add(v);
                formatted.push(makeLine(curLine.getFormatted()));
                curLine.reset();
            } else if (k === a.length - 1) {
                // last line
                curLine.add(v);
            } else {
                // middle lines
                curLine.add(v);
                formatted.push(makeLine(curLine.getFormatted()));
                curLine.reset();
            }
        };

        let annotate: string = "";

        for (i = 0; i < len; ++i) {
            var lineNum = formatted.length;
            annotate = annotatedLines.get(lineNum) ? "annotated" : "";
            var tok = allTokens[i];

            if (tok.type === "(nl)" && tok.value === "\n") {
                curLine.add(tok.value, tok);
                formatted.push(makeLine(curLine.getFormatted(), annotate));
                curLine.reset();
            } else if (tok.type === "LineComment") {
                curLine.add(tok.value, tok, "span", "ace_comment ace_line ace_asp");
            } else if (tok.type === "BlockComment") {
                if (tok.value.indexOf("\n") !== -1) {
                    tok.value.split("\n").forEach(processCommentBlock);
                } else {
                    curLine.add(tok.value, tok, "span", "ace_comment ace_block ace_asp");
                }
            } else if (tok.type === "number") {
                curLine.add(tok.value, tok, "span", "ace_constant ace_numeric ace_asp");
            } else if (tok.type === "string") {
                if (tok.double) {
                    curLine.add(
                        '"' + tok.value.replace(/"/g, '""') + '"',
                        tok,
                        "span",
                        "ace_quoted ace_string ace_double ace_asp"
                    );
                } else {
                    curLine.add(
                        "'" + tok.value.replace(/'/g, "''") + "'",
                        tok,
                        "span",
                        "ace_quoted ace_string ace_single ace_asp"
                    );
                }
            } else if (tok.type === "name") {
                if (tok.extra) {
                    if (tok.extra.type === "FunctionDeclaration") {
                        curLine.add(
                            tok.value,
                            tok,
                            "span",
                            "ace_entity ace_name ace_function ace_asp"
                        );
                    } else if (tok.extra.type === "VariableType") {
                        curLine.add(tok.value, tok, "span", "ace_support ace_type");
                    } else if (tok.extra.type === "MemberCall") {
                        if (tok.extra.callType === "this") {
                            curLine.add(
                                tok.value,
                                tok,
                                "span",
                                "ace_entity ace_name ace_function ace_asp",
                                "callType='this' name='" + tok.value + "'"
                            );
                        } else {
                            curLine.add(
                                tok.value,
                                tok,
                                "span",
                                "ace_entity ace_name ace_function ace_asp"
                            );
                        }
                    } else if (tok.extra.type === "FunctionCall") {
                        curLine.add(
                            tok.value,
                            tok,
                            "span",
                            "ace_entity ace_name ace_function ace_asp" +
                                (tok.extra.annotated ? " annotated" : ""),
                            "callType='local' name='" + tok.value + "'"
                        );
                    } else if (tok.extra.type === "PropertyName") {
                        curLine.add(
                            tok.value,
                            tok,
                            "span",
                            "ace_entity ace_other ace_attribute-name"
                        );
                    }
                } else {
                    if (_.indexOf(keywords, tok.value.toLowerCase()) !== -1) {
                        curLine.add(tok.value, tok, "span", "ace_keyword ace_control ace_asp");
                    } else {
                        curLine.add(tok.value, tok, "span", "ace_entity ace_name ace_asp");
                    }
                }
            } else {
                curLine.add(tok.value, tok);
            }
        }

        if (!curLine.empty()) {
            formatted.push(makeLine(curLine.getFormatted(), annotate));
        }

        formatted.push("</div></div>");

        return formatted.join("");
    }
}

class LineFormatter {
    raw: string;
    formatted: string;

    constructor(public spans: Span[]) {
        this.raw = "";
        this.formatted = "";
    }

    expandTabs(val: string, offset: number = 0): string {
        return val
            .split("\t")
            .map((v, i, a) => {
                var t =
                    v +
                    (i + 1 >= a.length ? "" : ["    ", "   ", "  ", " "][(offset + v.length) % 4]);
                offset = 0;
                return t;
            })
            .join("");
    }

    add(
        val: string,
        tok: Token | null = null,
        elType: string = "",
        classNames: string = "",
        attrs: string = ""
    ) {
        const expanded = this.expandTabs(val, this.raw.length),
            replaced = expanded.replace(/ /g, "&nbsp;");

        if (tok !== null) {
            tok.range[0];
            tok.range[1];
        }

        this.raw += expanded;

        if (arguments.length > 1) {
            this.formatted += [
                "<",
                elType,
                " class='",
                classNames || "",
                "' ",
                attrs || "",
                ">",
                replaced,
                "</",
                elType,
                ">"
            ].join("");
        } else {
            this.formatted += replaced;
        }
    }

    getFormatted(): string {
        return this.formatted;
    }

    reset() {
        this.raw = "";
        this.formatted = "";
    }

    empty(): boolean {
        return this.raw === "";
    }
}

function makeLine(content: string, annotated: string = ""): string {
    var match = /^((?:\&nbsp\;)*)(.*)/gi.exec(content);
    var leadingSpaces = "";

    if (match) {
        leadingSpaces = match[1];
        content = match[2];
    }

    return (
        '<div class="ace_line ' +
        (annotated || "") +
        '"><span class="ace_gutter ace_gutter-cell" unselectable="on"></span>' +
        leadingSpaces +
        '<span class="ace_code_line">' +
        content +
        "</span></div>"
    );
}

function getASTNode(v: any) {
    if (v) {
        if (_.isArray(v)) {
            return v[0];
        } else {
            return v;
        }
    }
    return null;
}
