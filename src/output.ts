interface Statement {
    stmt: string;
    corrected: string | null;
    err: string | null;
}

class ExecInfo {
    code: string;
    statements: Statement[];
    replacements: boolean;

    constructor() {
        this.code = "";
        this.statements = [];
        this.replacements = false;
    }
}

class Output {
    curFile: string;
    curExec: ExecInfo;

    constructor() {
        this.curFile = "";
        this.curExec = {
            code: "",
            statements: [],
            replacements: false
        };
    }

    startFile(filename: string) {
        if (this.curFile !== "") {
            this.endFile();
        }

        this.curFile = filename;
    }

    newExec(code: string, execType: string) {}

    endFile() {
        if (this.curFile === "") {
            return;
        }

        this.curFile = "";
    }
}
