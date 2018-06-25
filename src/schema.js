var fs = require("fs");

const parseTblCol = c => {
    const parts = c.trim().split(".");

    if (parts.length === 3) {
        return { table: `${parts[0]}.${parts[1]}`, column: parts[2] };
    } else if (parts.length === 2) {
        return { table: parts[0], column: parts[1] };
    }
    return null;
};

module.exports = buildSchema = (...files) => {
    console.log("Building schema from files: ", files);

    let schema = files
        .map(f => JSON.parse(fs.readFileSync(f, { encoding: "utf-8" })))
        .reduce((prev, cur) => prev.concat(cur), []);

    var tables = {},
        cols = {};

    for (s of schema) {
        const info = parseTblCol(s);

        if (info === null) {
            console.log("Cannot parse: ", s);
            continue;
        }

        let [lowerTableName, lowerColName] = [
            info.table.toLowerCase(),
            info.column.toLowerCase()
        ];

        let tblEntry = tables[lowerTableName];

        if (!tblEntry) {
            tblEntry = tables[lowerTableName] = {};
            tblEntry.name = info.table;
            tblEntry.cols = {};
        }

        tblEntry.cols[lowerColName] = info.column;
    }

    fs.writeFileSync(
        "./src/assets/schema.json",
        JSON.stringify({ tables, cols }, null, 2),
        {
            encoding: "utf-8"
        }
    );
};
