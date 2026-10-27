import assert from 'node:assert/strict';
import { createLoader, plain } from './load-module.mjs';

const marker = { metadataKey: 'feros-tracker-layout', metadataValue: 'date-rows-v1' };
export function setup({ rows = [['Date', 'Run', 'Read']], definitions = [['ID','Name','Type'], ['run','Run','boolean'], ['read','Read','numeric']], legacy = false, existing = 'sheet-1', failDrive = false, failBatch = false, loseBatchResponse = false, columns = 26, rowCount = 1000, extraTabs = [], sheetName = 'Habits', apiModule = 'src/lib/googleSheets.ts' } = {}) {
  const calls = [];
  let gridCellsRead = 0;
  let version = 0;
  let responseLost = false;
  const tab = (sheetId, title, rows, columnCount = 26) => ({ properties: { sheetId, title, gridProperties: { columnCount, rowCount } }, rows: plain(rows) });
  let tabs = [tab(0,sheetName,rows,columns), ...extraTabs];
  if (!legacy) tabs[0].developerMetadata = [marker];
  if (definitions !== null) tabs.push(tab(1,'HabitDefinitions',definitions,3));
  const get = (state, id) => { const sheet=state.find((sheet)=>sheet.properties.sheetId===id); assert.ok(sheet,`Missing sheet ${id}`); return sheet; };
  function put(sheet, row, col, values) {
    assert.ok(row + values.length <= sheet.properties.gridProperties.rowCount, 'Write exceeds row count');
    for(let i=0;i<values.length;i++) {
      sheet.rows[row+i] ??= [];
      assert.ok(col+values[i].length <= sheet.properties.gridProperties.columnCount, 'Write exceeds column count');
      for(let j=0;j<values[i].length;j++) sheet.rows[row+i][col+j]=values[i][j];
    }
  }
  const unpack = (rows) => rows.map((row)=>(row.values??[]).map((cell)=>cell.userEnteredValue?.stringValue??''));
  function apply(state, request) {
    if(request.duplicateSheet) {
      const {sourceSheetId,newSheetId,newSheetName}=request.duplicateSheet;
      assert.ok(!state.some((sheet)=>sheet.properties.sheetId===newSheetId || sheet.properties.title===newSheetName));
      const copy=plain(get(state,sourceSheetId)); copy.properties.sheetId=newSheetId;copy.properties.title=newSheetName; state.push(copy);
    } else if(request.addSheet) {
      const props=request.addSheet.properties;
      assert.ok(!state.some((sheet)=>sheet.properties.sheetId===props.sheetId || sheet.properties.title===props.title));
      state.push(tab(props.sheetId,props.title,[],props.gridProperties?.columnCount??26));
      if(props.hidden) state.at(-1).properties.hidden=true;
      if(props.gridProperties) Object.assign(state.at(-1).properties.gridProperties,props.gridProperties);
    } else if(request.updateCells) {
      const update=request.updateCells, position=update.start??update.range;
      const target=get(state,position.sheetId);
      if(update.range) target.rows=[];
      put(target,position.rowIndex??0,position.columnIndex??0,unpack(update.rows));
    } else if(request.appendDimension) {
      const {sheetId,dimension,length}=request.appendDimension;
      const target=get(state,sheetId);
      target.properties.gridProperties[dimension==='COLUMNS'?'columnCount':'rowCount']+=length;
    } else if(request.deleteDimension) {
      const {sheetId,dimension,startIndex,endIndex}=request.deleteDimension.range;
      const target=get(state,sheetId), count=endIndex-startIndex;
      assert.ok(count > 0 && startIndex >= 0);
      if(dimension==='COLUMNS') {
        for(const row of target.rows) row.splice(startIndex,count);
        target.properties.gridProperties.columnCount-=count;
      } else {
        target.rows.splice(startIndex,count);
        target.properties.gridProperties.rowCount-=count;
      }
    } else if(request.updateSheetProperties) {
      const props=request.updateSheetProperties.properties;
      Object.assign(get(state,props.sheetId).properties.gridProperties,props.gridProperties);
    } else if(request.createDeveloperMetadata) {
      const metadata=request.createDeveloperMetadata.developerMetadata;
      const target=get(state,metadata.location.sheetId);
      (target.developerMetadata??=[]).push(metadata);
    } else if(request.appendCells) {
      const {sheetId,rows}=request.appendCells;
      const target=get(state,sheetId), values=unpack(rows);
      target.properties.gridProperties.rowCount=Math.max(target.properties.gridProperties.rowCount,target.rows.length+values.length);
      put(target,target.rows.length,0,values);
    } else throw new Error(`Unsupported test request: ${Object.keys(request)}`);
  }
  const request = async (url,options={}) => {
    const parsed=new URL(url),path=decodeURIComponent(parsed.pathname),body=options.body?JSON.parse(options.body):undefined;
    calls.push({url,method:options.method??'GET',body});
    if(parsed.hostname==='www.googleapis.com') {
      if(failDrive) throw new Error('Drive unavailable');
      return {files:existing?[{id:existing}]:[]};
    }
    if(path==='/v4/spreadsheets' && options.method==='POST') {
      tabs=body.sheets.map((sheet)=>({properties:{sheetId:sheet.properties.sheetId,title:sheet.properties.title,gridProperties:{rowCount:1000,columnCount:26,...sheet.properties.gridProperties}},rows:unpack(sheet.data[0].rowData)}));
      for(const metadata of body.developerMetadata??[]) (get(tabs,metadata.location.sheetId).developerMetadata??=[]).push(metadata);
      return {spreadsheetId:'new-sheet'};
    }
    if(path.endsWith('/values:batchUpdate')) {
      const copy=plain(tabs);
      for(const entry of body.data) {
        const match=entry.range.match(/^Habits!([A-Z]+)(\d+)$/); assert.ok(match);
        const col=[...match[1]].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1;
        put(get(copy,0),Number(match[2])-1,col,entry.values);
      }
      tabs=copy;return {};
    }
    if(path.endsWith(':batchUpdate')) {
      if(failBatch) throw new Error('Simulated batch failure');
      const copy=plain(tabs);
      for(const update of body.requests) apply(copy,update);
      tabs=copy;
      if(loseBatchResponse && !responseLost) { responseLost=true; throw new Error('Response lost after commit'); }
      return {};
    }
    if(path.includes('/values/')) {
      const name=path.split('/values/')[1].split('!')[0].replaceAll("'",'');
      const target=tabs.find((sheet)=>sheet.properties.title===name);assert.ok(target,`Missing range ${name}`);
      return {values:plain(target.rows)};
    }
    if(parsed.searchParams.get('fields')?.includes('data(')) {
      const ranges=parsed.searchParams.getAll('ranges');
      const sheets=[];
      const colIndex=text=>[...text].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1;
      for(const {rows,...metadata} of tabs) {
        const data=[];
        for(const range of ranges) {
          const [name,selection]=range.replaceAll("'",'').split('!');if(name!==metadata.properties.title)continue;
          let row=0,col=0,endRow=rows.length,endCol=Infinity;
          if(selection==='1:1')endRow=Math.min(1,rows.length);
          else if(selection) {
            const m=selection.match(/^([A-Z]+)(\d*)?(?::([A-Z]+)(\d*)?)?$/);assert.ok(m,`Unsupported test range ${range}`);
            col=colIndex(m[1]);row=m[2]?Number(m[2])-1:0;
            endCol=colIndex(m[3]??m[1])+1;
            if(!selection.includes(':'))endRow=Math.min(rows.length,row+1);
            else if(m[4])endRow=Math.min(rows.length,Number(m[4]));
          }
          const selected=rows.slice(row,endRow).map(source=>Array.from({length:Math.max(0,Math.min(source.length,endCol)-col)},(_,index)=>source[col+index]??''));
          while(selected.length&&!selected.at(-1).some(Boolean))selected.pop();
          gridCellsRead+=selected.reduce((sum,row)=>sum+row.length,0);
          data.push({startRow:row,startColumn:col,rowData:selected.map(row=>({values:row.map(value=>({formattedValue:value,userEnteredValue:{stringValue:value}}))}))});
        }
        if(data.length)sheets.push({...metadata,data});
      }
      return {sheets:plain(sheets)};
    }
    return {spreadsheetId:'sheet-1',sheets:plain(tabs.map(({rows,...metadata})=>metadata))};
  };
  const auth={getAuthVersion:()=>version,getValidAccessToken:()=>'token',SessionExpiredError:class extends Error{}};
  const sheets=createLoader({mocks:{'./googleApi':{googleRequest:request},'./googleOAuth':auth}})(apiModule);
  return {sheets,calls,get gridCellsRead(){return gridCellsRead;},get tabs(){return tabs;},get rows(){return get(tabs,0).rows;},get definitions(){return tabs.find((sheet)=>sheet.properties.title==='HabitDefinitions')?.rows;},signOut(){version++;}};
}
