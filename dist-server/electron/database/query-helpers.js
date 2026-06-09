"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryAll = queryAll;
exports.queryOne = queryOne;
exports.executeRun = executeRun;
exports.execSQL = execSQL;
exports.executeTransaction = executeTransaction;
const connection_1 = require("./connection");
function queryAll(sql, params = []) {
    const db = (0, connection_1.requireDatabase)();
    const stmt = db.prepare(sql);
    if (params.length > 0) {
        stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
        results.push({ ...stmt.getAsObject() });
    }
    stmt.free();
    return results;
}
function queryOne(sql, params = []) {
    const db = (0, connection_1.requireDatabase)();
    const stmt = db.prepare(sql);
    if (params.length > 0) {
        stmt.bind(params);
    }
    let result;
    if (stmt.step()) {
        result = { ...stmt.getAsObject() };
    }
    stmt.free();
    return result;
}
function executeRun(sql, params = []) {
    const db = (0, connection_1.requireDatabase)();
    db.run(sql, params);
    const rowsModified = db.getRowsModified();
    (0, connection_1.saveDatabase)();
    return {
        changes: rowsModified,
        lastInsertRowid: -1,
    };
}
function execSQL(sql) {
    const db = (0, connection_1.requireDatabase)();
    db.exec(sql);
    (0, connection_1.saveDatabase)();
}
function executeTransaction(operations) {
    const db = (0, connection_1.requireDatabase)();
    try {
        db.run('BEGIN TRANSACTION');
        for (const op of operations) {
            db.run(op.sql, (op.params || []));
        }
        db.run('COMMIT');
        (0, connection_1.saveDatabase)();
    }
    catch (err) {
        db.run('ROLLBACK');
        (0, connection_1.saveDatabase)();
        throw err;
    }
}
//# sourceMappingURL=query-helpers.js.map