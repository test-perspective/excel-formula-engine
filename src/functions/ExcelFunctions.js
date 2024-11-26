export class ExcelFunctions {
  constructor(engine) {
    this.engine = engine;
    this.functions = {
      'SUM': (args, allTables, currentTableIndex) => this.SUM(args, allTables, currentTableIndex),
      'AVERAGE': (args, allTables, currentTableIndex) => this.AVERAGE(args, allTables, currentTableIndex),
      'COUNT': (args, allTables, currentTableIndex) => this.COUNT(args, allTables, currentTableIndex),
      'MAX': (args, allTables, currentTableIndex) => this.MAX(args, allTables, currentTableIndex),
      'MIN': (args, allTables, currentTableIndex) => this.MIN(args, allTables, currentTableIndex)
    };
  }

  SUM(args, allTables, currentTableIndex) {
    try {
      const values = this.getFunctionArgValues(args, allTables, currentTableIndex);
      const numbers = values
        .map(v => Number(v))
        .filter(n => !isNaN(n));
      return numbers.reduce((sum, val) => sum + val, 0);
    } catch (error) {
      return '#ERROR!';
    }
  }

  AVERAGE(args, allTables, currentTableIndex) {
    try {
      const values = this.getFunctionArgValues(args, allTables, currentTableIndex);
      const numbers = values
        .map(v => Number(v))
        .filter(n => !isNaN(n));
      if (numbers.length === 0) return 0;
      return numbers.reduce((sum, val) => sum + val, 0) / numbers.length;
    } catch (error) {
      return '#ERROR!';
    }
  }

  COUNT(args, allTables, currentTableIndex) {
    try {
      const values = this.getFunctionArgValues(args, allTables, currentTableIndex);
      return values.filter(value => 
        typeof value === 'number' || 
        (typeof value === 'string' && !isNaN(value))
      ).length;
    } catch (error) {
      return '#ERROR!';
    }
  }

  MAX(args, allTables, currentTableIndex) {
    try {
      const values = this.getFunctionArgValues(args, allTables, currentTableIndex);
      const numbers = values
        .map(v => Number(v))
        .filter(n => !isNaN(n));
      if (numbers.length === 0) return '#ERROR!';
      return Math.max(...numbers);
    } catch (error) {
      return '#ERROR!';
    }
  }

  MIN(args, allTables, currentTableIndex) {
    try {
      const values = this.getFunctionArgValues(args, allTables, currentTableIndex);
      const numbers = values
        .map(v => Number(v))
        .filter(n => !isNaN(n));
      if (numbers.length === 0) return '#ERROR!';
      return Math.min(...numbers);
    } catch (error) {
      return '#ERROR!';
    }
  }

  getFunctionArgValues(args, allTables, currentTableIndex) {
    return args.map(arg => {
      if (arg.type === 'range') {
        const tableIndex = arg.tableId !== undefined ? arg.tableId : currentTableIndex;
        return this.engine.getRangeValues(arg.reference, allTables, tableIndex);
      } else if (arg.type === 'cell') {
        const tableIndex = arg.tableId !== undefined ? arg.tableId : currentTableIndex;
        return [this.engine.getCellValue(arg.reference, allTables, tableIndex)];
      } else if (arg.type === 'literal') {
        return [arg.value];
      }
    }).flat();
  }
}