function toMySQLDateTime(isoString) {
    const date = new Date(isoString);
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function fromMySQLDateTime(mysqlDateTime) {
    return new Date(mysqlDateTime + 'Z').toISOString();
}

module.exports = { toMySQLDateTime, fromMySQLDateTime };
