const fs = require('fs');
const path = require('path');
const dbJson = path.join(__dirname, 'db.sql.json');
const outDirname = path.dirname(__dirname);
const createPath = path.join(outDirname, 'create-generated.sql');
const insertPath = path.join(outDirname, 'insert-generated.sql');

// loads the json in a format the test runner will recognize, 
// a list of lists of values. first list is the table headers
function loadMapper(t) {
    let table = t.slice(2);
    let tableCols = table
        .map(col => Object.keys(col).filter(k => k !== 'data')[0])
        .filter(x => x  !== 'rowversioncol');
    let tableRows = table[0].data.map((_, idx) => {
            return table
                .map((col, i) => col.data && col.data[idx])
                .filter(x => x !== undefined)
                .map(x => {
                    let dateRegex = /\d\d\d\d\-\d\d\-\d\d/;
                    let tsRegex = /\d{2}:\d{2}:\d{2}\.\d{7}/;
                    // specifies how the various sql inputs map to web output, using strings or regexes
                    if (x === 'newid()') { // uuid regex
                        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                    } else if (dateRegex.test(x)) {
                        return dateRegex;
                    } else if (x.indexOf && x.indexOf('0x') === 0) {
                         return /.../; // not really sure whats being returned by sql server here ...
                    } else if (x.replace) { // unquote \o/
                        return x.replace(/^\'([^']*)'$/, '$1');
                    } else {
                        return x.toString();   
                    }
                });
        });
    return [tableCols].concat(tableRows);    
}

function load() {
    return new Promise((done, err) => {
        fs.readFile(dbJson, 'utf8', (err, text) => {
            if (err) throw err;
            const data = JSON.parse(text.replace(/\/\/(.*)/g, ''));
            done(data.map(loadMapper));
        });        
    });
}

function generate() {
    return new Promise((done, err) => {
        fs.readFile(dbJson, 'utf8', (err, text) => {
            if (err) throw err;
            const data = JSON.parse(text.replace(/\/\/(.*)/g, ''));
            const sqlData = data.map(definition => {
                let useName = definition[0];
                let tableName = definition[1];
                let def = definition.slice(2);
                let createCols = def.map(column => {
                    const colName = Object.keys(column).filter(k => k !== 'data')[0];
                    return `${colName} ${column[colName]}`;
                }).join(',\n');
                let insertCols = def
                    .map(column => Object.keys(column).filter(k => k !== 'data')[0])
                    .filter(x => x !== 'rowversioncol') // todo exception!
                    .join(',\n');
                const rowsVals = def
                    .map(c => c.data)
                    .filter(x => x !== undefined)
                    .map(x => {
                        // special casing the boolean, because its easier then inferring that 
                        // some column value "1" should be "true", when rendered in the UI
                        if (x.toString() === 'true') {
                            return '1';
                        }
                        return x;
                    });
                // to get all the rows
                let insertData = rowsVals[0].map((_, idx) => {
                    return rowsVals.map(row => row[idx]);
                });
                const create = createTemplate(useName, tableName, createCols);
                const insert = insertTemplate(useName, tableName, insertCols, insertData);
                return [create, insert];
            });

            let sqlScripts = sqlData.reduce((prev, curr) => {
                return {
                    create: prev.create + curr[0],
                    insert: prev.insert + curr[1]
                };
            }, { create: "", insert: "" });
            
            fs.writeFile(createPath, sqlScripts.create, function(err) {
                if (err) throw err;
                console.log(`Wrote ${createPath}`);
                fs.writeFile(insertPath, sqlScripts.insert, function(err) {
                    if (err) throw err;
                    console.log(`Wrote ${insertPath}`);
                    done();
                });
            });
        });        
    });
}

function createTemplate(useName, tableName, columns) {
    return `use ${useName};
create table ${tableName} (
${columns}
);
`;
}

function insertTemplate(useName, tableName, insertCols, insertData) {
    let inserts = insertData.map(data => {
        return `
insert into ${tableName}(
${insertCols}
)
values (
${data}
);
`;
    });
    return `use ${useName};
${inserts.join('\n')}
`;
}

module.exports.load = load;
module.exports.generate = generate;
