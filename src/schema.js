var fs = require("fs");

module.exports = buildSchema = (...files) => {
    console.log("Building schema from files: ", files);

    let schema = files
        .map(f => JSON.parse(fs.readFileSync(f, { encoding: "utf-8" })))
        .reduce((prev, cur) => prev.concat(cur), []);

    var tables = {},
        cols = {};

    for (s of schema) {
        let [tableName, colName] = s.trim().split(".");
        let [lowerTableName, lowerColName] = [
            tableName.toLowerCase(),
            colName.toLowerCase()
        ];

        let tblEntry = tables[lowerTableName];

        if (!tblEntry) {
            tblEntry = tables[lowerTableName] = {};
            tblEntry.name = tableName;
            tblEntry.cols = {};
        }

        tblEntry.cols[lowerColName] = colName;
    }

    fs.writeFileSync(
        "./src/assets/schema.json",
        JSON.stringify({ tables, cols }, null, 2),
        {
            encoding: "utf-8"
        }
    );
};
