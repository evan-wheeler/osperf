import OSFormat from "./osformat";
import fs from "fs";
import { O_WRONLY } from "constants";

interface Statement {
    stmt: string;
    spans: any;
    warnings: string[];
    err: string;
}

class ExecInfo {
    statements: Statement[];

    constructor(public node: any) {
        this.statements = [];
    }

    addGood(stmt: any) {
        this.statements.push({ stmt: stmt.value, spans: stmt.asSpans(), warnings: [], err: "" });
    }
    addWarning(stmt: any, warnings: string[]) {
        this.statements.push({ stmt: stmt.value, spans: stmt.asSpans(), warnings, err: "" });
    }
    addError(stmt: any, err: string) {
        this.statements.push({ stmt: stmt.value, spans: stmt.asSpans(), err, warnings: [] });
    }
}

export class FileReport {
    execs: ExecInfo[];

    constructor(public curFile: string) {
        this.execs = [];
    }

    curExec(): ExecInfo {
        return this.execs[this.execs.length - 1];
    }

    newExec(node: any) {
        this.execs.push(new ExecInfo(node));
    }

    format() {}
}
