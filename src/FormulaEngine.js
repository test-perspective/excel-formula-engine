import { FormulaParser } from './parsers/FormulaParser.js';
import { ExcelFunctions } from './functions/ExcelFunctions.js';
import { CellReference } from './utils/CellReference.js';
import { FormulaError } from './types/index.js';
import { ExcelFormatter } from './formatter/ExcelFormatter.js';
import { ErrorHandler } from './utils/ErrorHandler.js';
import { CellParser } from './parsers/CellParser.js';
import { BasicEvaluator } from './evaluators/BasicEvaluator.js';

export class FormulaEngine {
  constructor() {
    this.parser = new FormulaParser();
    this.functions = {
      'SUM': (args, allTables, currentTableIndex) => {
        let sum = 0;
        for (const arg of args) {
          if (arg.type === 'range') {
            const tableIndex = arg.tableId !== undefined ? arg.tableId : currentTableIndex;
            const values = this.getRangeValues(arg.reference, allTables, tableIndex);
            if (values && values.length > 0) {
              sum += values.reduce((acc, val) => acc + val, 0);
            }
          } else if (arg.type === 'cell') {
            const tableIndex = arg.tableId !== undefined ? arg.tableId : currentTableIndex;
            const value = this.getCellValue(arg.reference, allTables, tableIndex);
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              sum += numValue;
            }
          } else if (arg.type === 'literal') {
            sum += arg.value;
          }
        }
        return sum;
      },
      'AVERAGE': (args, allTables, currentTableIndex) => {
        try {
          const values = [];
          
          for (const arg of args) {
            if (arg.type === 'range') {
              const tableIndex = arg.tableId !== undefined ? arg.tableId : currentTableIndex;
              const rangeValues = this.getRangeValues(arg.reference, allTables, tableIndex);
              if (rangeValues) {
                values.push(...rangeValues);
              }
            } else if (arg.type === 'cell') {
              const tableIndex = arg.tableId !== undefined ? arg.tableId : currentTableIndex;
              const value = this.getCellValue(arg.reference, allTables, tableIndex);
              const numValue = Number(value);
              if (!isNaN(numValue)) {
                values.push(numValue);
              }
            } else if (arg.type === 'literal') {
              values.push(arg.value);
            }
          }

          return ExcelFunctions.AVERAGE(values);
        } catch (error) {
          return '#ERROR!';
        }
      },
      'COUNT': (args, allTables, currentTableIndex) => {
        const values = this.getFunctionArgValues(args, allTables, currentTableIndex);
        return ExcelFunctions.COUNT(values);
      },
      'MAX': (args, allTables, currentTableIndex) => {
        const values = this.getFunctionArgValues(args, allTables, currentTableIndex);
        return ExcelFunctions.MAX(values);
      },
      'MIN': (args, allTables, currentTableIndex) => {
        const values = this.getFunctionArgValues(args, allTables, currentTableIndex);
        return ExcelFunctions.MIN(values);
      }
    };
    this.formatter = new ExcelFormatter();
  }

  getFunctionArgValues(args, allTables, currentTableIndex) {
    try {
      return args.map(arg => {
        if (arg.type === 'range') {
          return this.getRangeValues(arg.reference, allTables, currentTableIndex);
        } else if (arg.type === 'cell') {
          return [this.getCellValue(arg.reference, allTables, currentTableIndex)];
        } else {
          return [this.evaluateAst(arg, allTables, currentTableIndex)];
        }
      }).flat();
    } catch (error) {
      throw error;
    }
  }

  processData(data) {
    const result = {
      tables: Array.isArray(data) ? data : [data.tables],
      formulas: []
    };

    result.tables.forEach((table, tableIndex) => {
      table.forEach((rows, rowIndex) => {
        rows.forEach((cell, colIndex) => {
          const originalValue = cell.value;
          
          // 数式の場合
          if (typeof originalValue === 'string' && originalValue.startsWith('=')) {
            const resolvedValue = this.evaluateFormula(originalValue, result.tables, tableIndex);
            cell.resolved = true;
            cell.resolvedValue = this._convertToNumber(resolvedValue);
            
            // フォーマット用の値を計算
            const formatValue = cell.excelFormat && cell.excelFormat.includes('%') 
              ? cell.resolvedValue / 100 
              : cell.resolvedValue;

            // フォーマットの適用
            if (cell.excelFormat) {
              const formatted = this.formatter.format(formatValue, cell.excelFormat);
              cell.displayValue = formatted.displayValue;
              if (formatted.textColor) {
                cell.textColor = formatted.textColor;
              }
            } else {
              cell.displayValue = String(formatValue);
            }

            // formulasに追加（計算結果を含む全てのプロパティを含める）
            result.formulas.push({
              table: tableIndex,
              row: rowIndex,
              col: colIndex,
              ...cell  // formulaプロパティを追加せず、セルの既存プロパティのみを使用
            });
            
          } else {
            // 通常の値の場合
            cell.resolved = true;
            cell.resolvedValue = originalValue;
            
            // フォーマットの適用
            if (cell.excelFormat) {
              const formatted = this.formatter.format(originalValue, cell.excelFormat);
              cell.displayValue = formatted.displayValue;
              if (formatted.textColor) {
                cell.textColor = formatted.textColor;
              }
            } else {
              cell.displayValue = String(originalValue);
            }
          }
        });
      });
    });

    return result;
  }

  evaluateFormula(formula, allTables, currentTableIndex, visited = new Set()) {
    try {
      if (!formula.startsWith('=')) {
        return formula;
      }

      const formulaKey = `${currentTableIndex}:${formula}`;
      if (visited.has(formulaKey)) {
        return '#CIRCULAR!';
      }
      visited.add(formulaKey);

      const ast = this.parser.parse(formula);
      const result = this.evaluateAst(ast, allTables, currentTableIndex, visited);
      
      visited.delete(formulaKey);
      return result;
    } catch (error) {
      return '#ERROR!';
    }
  }

  evaluateAst(ast, allTables, currentTableIndex) {
    if (!ast) return null;

    try {
      switch (ast.type) {
        case 'operation':
          const left = this.evaluateAst(ast.left, allTables, currentTableIndex);
          const right = this.evaluateAst(ast.right, allTables, currentTableIndex);
          
          // 数値に変換
          const leftNum = Number(left);
          const rightNum = Number(right);
          
          if (isNaN(leftNum) || isNaN(rightNum)) {
            return '#ERROR!';
          }

          switch (ast.operator) {
            case '+': return leftNum + rightNum;
            case '-': return leftNum - rightNum;
            case '*': return leftNum * rightNum;
            case '/': return rightNum === 0 ? '#DIV/0!' : leftNum / rightNum;
            case '^': return Math.pow(leftNum, rightNum);
            default: throw new Error(`Unknown operator: ${ast.operator}`);
          }

        case 'function':
          if (!(ast.name in this.functions)) {
            throw new Error(`Unknown function: ${ast.name}`);
          }
          return this.functions[ast.name](ast.arguments, allTables, currentTableIndex);

        case 'cell':
          const tableIndex = ast.tableId !== undefined ? ast.tableId : currentTableIndex;
          return this.getCellValue(ast.reference, allTables, tableIndex);

        case 'range':
          const rangeTableIndex = ast.tableId !== undefined ? ast.tableId : currentTableIndex;
          return this.getRangeValues(ast.reference, allTables, rangeTableIndex);

        case 'literal':
          return ast.value;

        default:
          throw new Error(`Unknown AST type: ${ast.type}`);
      }
    } catch (error) {
      return '#ERROR!';
    }
  }

  getRangeValues(range, data, tableIndex) {
    try {
      if (tableIndex >= data.length) {
        return null;
      }

      const table = data[tableIndex];
      const normalizedRange = range.replace(/([a-z]+)/gi, match => match.toUpperCase());
      const [startRef, endRef] = normalizedRange.split(':');
      const start = this.parseCellReference(startRef);
      const end = this.parseCellReference(endRef);
      
      if (!start || !end) {
        return null;
      }

      const values = [];
      for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
        for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col++) {
          if (table?.[row]?.[col]) {
            const cell = table[row][col];
            const value = cell.resolvedValue !== undefined ? cell.resolvedValue : cell.value;
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              values.push(numValue);
            }
          }
        }
      }
      
      return values;
    } catch (error) {
      return null;
    }
  }

  getCellValue(ref, data, tableIndex) {
    if (tableIndex >= data.length) {
      return '#REF!';
    }

    const cellRef = this.parseCellReference(ref);
    if (!cellRef) {
      return '#REF!';
    }

    try {
      const cell = data[tableIndex][cellRef.row][cellRef.col];
      return cell.resolvedValue !== undefined ? cell.resolvedValue : cell.value;
    } catch (e) {
      return '#REF!';
    }
  }

  parseCellReference(ref) {
    const match = ref.match(/^(\$?)([A-Za-z]+)(\$?)(\d+)$/i);
    if (!match) {
      return null;
    }

    const [_, colAbs, colStr, rowAbs, rowStr] = match;
    
    let column = 0;
    const upperColStr = colStr.toUpperCase();
    for (let i = 0; i < upperColStr.length; i++) {
      column = column * 26 + (upperColStr.charCodeAt(i) - 'A'.charCodeAt(0));
    }

    return {
      col: column,
      row: parseInt(rowStr) - 1,
      isAbsoluteCol: colAbs === '$',
      isAbsoluteRow: rowAbs === '$'
    };
  }

  // 数値変換のヘルパーメソッド
  _convertToNumber(value) {
    if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
      return Number(value);
    }
    return value;
  }

} 