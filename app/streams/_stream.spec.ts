import * as chai from 'chai';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { ReflectiveInjector, enableProdMode } from '@angular/core';
import { Http, XHRBackend, ConnectionBackend, BrowserXhr, ResponseOptions, 
    BaseResponseOptions, RequestOptions, BaseRequestOptions } from '@angular/http';
import { Observable } from 'rxjs/Rx';
import { QueryMessage, OmnisharpMessage } from '../messages/index';
import { QueryStream, SessionStream, EditorStream, ResultStream, OmnisharpStream } from './index';
import config from '../config';
import { CodeCheckResult, AutocompletionQuery, Connection } from '../models';
import XSRFStrategyMock from '../test/xsrf-strategy-mock';
import { cSharpTestData, cSharpTestDataExpectedResult, cSharpTestDataExpectedCodeChecks,
    codecheckEditorTestData, cSharpAutocompletionEditorTestData, cSharpAutocompletionRequestTestData,
    cSharpAutocompletionExpectedValues, cSharpContextSwitchExpectedCodeChecks, 
    cSharpContextSwitchEditorTestData, cSharpCityFilteringQueryEditorTestData,
    cSharpDatabaseCodeCheckEditorTestData, cSharpDatabaseCodeCheckExpectedErrors } from '../test/editor-testdata';
import replaySteps from '../test/replay-steps';
import * as uuid from 'node-uuid';
const http = electronRequire('http');
const backendTimeout = config.unitTestData.backendTimeout;
const sqliteConnectionString = config.unitTestData.sqliteWorlddbConnectionString; 
const sqliteConnection = new Connection(sqliteConnectionString, 'sqlite');
sqliteConnection.id = 42;

describe('[int-test] streams', function() {
    this.timeout(backendTimeout * 100);
    let session: SessionStream = null;
    let editor: EditorStream = null;
    let result: ResultStream = null;
    let injector: ReflectiveInjector = null;
    let query: QueryStream = null;
    let omnisharp: OmnisharpStream = null;
    
    before(function() {
        chai.expect();
        chai.use(sinonChai);
        injector = ReflectiveInjector.resolveAndCreate([
            Http, BrowserXhr, XSRFStrategyMock,
            { provide: ConnectionBackend, useClass: XHRBackend },
            { provide: ResponseOptions, useClass: BaseResponseOptions },
            { provide: RequestOptions, useClass: BaseRequestOptions },
            QueryStream,
            SessionStream,
            EditorStream,
            ResultStream,
            OmnisharpStream
        ]);
        session = injector.get(SessionStream);
        editor = injector.get(EditorStream);
        result = injector.get(ResultStream);
        query = injector.get(QueryStream);
        omnisharp = injector.get(OmnisharpStream);
    });

    it('waits for backends to be ready', function(done) {
        this.timeout(backendTimeout);
        let queryReady = false;
        let omnisharpReady = false;
        query.once(msg => msg.type === 'ready', () => {
            queryReady = true;
            if (omnisharpReady) {
                done();
            }
        });
        omnisharp.once(msg => msg.type === 'ready', () => {
            omnisharpReady = true;
            if (queryReady) {
                done();
            }
        });
    });

    it('emits result messages for simple value expressions', function(done) {
        this.timeout(backendTimeout * (cSharpTestData.length + 1));
        let verifyCount = 0;
        cSharpTestData.forEach((testData, idx: number) => {
            // only a single page
            const expectedPage = cSharpTestDataExpectedResult[idx][0]; 
            const id = uuid.v4();
            const resultSub = result.events
                .filter(msg => msg.id === id)
                .subscribe(msg => {
                    if (msg.type === 'done') {
                        resultSub.unsubscribe();
                        if (idx === cSharpTestData.length - 1) {
                            expect(verifyCount).to.equal(cSharpTestData.length, 
                                `verifyCount (${verifyCount}) should match length of test data: ${cSharpTestData.length}`);
                            done();
                        }
                    } else if (msg.type === 'update') {
                        expect(msg.data.id).to.equal(id);
                        expect(msg.data.title).to.equal(expectedPage.title);
                        expect(msg.data.columns).to.deep.equal(expectedPage.columns);
                        expect(msg.data.columnTypes).to.deep.equal(expectedPage.columnTypes);
                        expect(msg.data.rows).to.deep.equal(expectedPage.rows);
                        verifyCount++;
                    }
                }); 
            
            replaySteps([
                () => session.new(id),
                { 
                    for: testData.events,
                    fn: (evt) => editor.edit(id, evt)
                },
                () => session.run(id)
            ]);
        });
    });

    it('emits results messages for linq based query against sqlite database', function(done) {
        this.timeout(backendTimeout * 3);
        const expectedPage = cSharpCityFilteringQueryEditorTestData[0]; 
        const id = uuid.v4();
        let rowCount = 0;
        let headers: any[] = null;
        let rows: any[] = null;
        const resultSub = result.events
            .filter(msg => msg.id === id)
            .subscribe(msg => {
                if (msg.type === 'done') {
                    resultSub.unsubscribe();
                    checkAndExit(done, () => {
                        let cityColIdx = 0;
                        expect(headers).to.contain('Name', '"Name" column on table');
                        for(let i = 0; i < headers.length; i++) {
                            if (headers[i] === 'Name') {
                                cityColIdx = i;
                                break;
                            }
                        }
                        for(let i = 0; i < rows.length; i++) {
                            expect(rows[0][cityColIdx].substring(0, 2)).to.equal('Ca', 'Name of city starts with "Ca"');
                        }
                        expect(rows.length).to.equal(83, 'Row count from query');
                    });
                } else if (msg.type === 'update') {
                    rows = msg.data.rows;
                    headers = msg.data.columns;
                }
            });
        
        replaySteps([
            () => session.new(id, sqliteConnection),
            { 
                for: cSharpCityFilteringQueryEditorTestData[0].events,
                fn: (evt) => editor.edit(id, evt)
            }, () => session.run(id)
        ]);
    });

    it('emits codecheck messages for simple statement', function(done) {
        this.timeout(backendTimeout * 2);
        const id = uuid.v4();
        const firstEdits = codecheckEditorTestData[0].events.filter(x => x.time < 6000);
        const secondEdits = codecheckEditorTestData[0].events.filter(x => x.time >= 6000);
        let codechecks = 0;
        let gotFirstResolver = null; 
        const gotFirst = new Promise((done) => { gotFirstResolver = done; });
        const codecheckSub = omnisharp.events.filter(msg => msg.type === 'codecheck' && msg.sessionId === id).subscribe(msg => {
            const expectedCheck = cSharpTestDataExpectedCodeChecks[codechecks];
            codechecks++;
            expect(msg.checks.length).to.equal(1);
            expect(msg.checks[0].text).to.equal(expectedCheck.text, 'text');
            expect(msg.checks[0].logLevel).to.equal(expectedCheck.logLevel, 'logLevel');
            expect(msg.checks[0].line).to.equal(expectedCheck.line, 'line');
            expect(msg.checks[0].column).to.equal(expectedCheck.column, 'column');
            expect(msg.checks[0].endLine).to.equal(expectedCheck.endLine, 'endLine');
            expect(msg.checks[0].endColumn).to.equal(expectedCheck.endColumn, 'endColumn');
            if (codechecks >= cSharpTestDataExpectedCodeChecks.length) {
                codecheckSub.unsubscribe();
                done();
            } else {
                gotFirstResolver();
            }
        });

        replaySteps([
            () => session.new(id),
            {
                for: firstEdits,
                fn: (evt) => editor.edit(id, evt)
            },
            () => session.codeCheck(id),
            {
                for: secondEdits,
                fn: (evt) => editor.edit(id, evt)
            },
            // if we don't wait for the first check, we risk queuing two codechecks on the same buffer timestamp.
            // if for instance the first codecheck has not yet returned, the second edits
            // have not been flushed, and since operations are prioritized over edits,
            // the second codecheck gets queued on the first buffer, resulting in the same error twice.
            () => gotFirst.then(() => session.codeCheck(id))
        ]);
    });


    it('emits codecheck messages for database query', function(done) {
        this.timeout(backendTimeout * 2);
        const id = uuid.v4();
        const firstEdits = cSharpDatabaseCodeCheckEditorTestData[0].events.filter(x => x.time < 6000);
        const secondEdits = cSharpDatabaseCodeCheckEditorTestData[0].events.filter(x => x.time >= 6000);
        let codechecks = 0;
        let isFirstCheck = true;
        let gotFirstResolver = null;
        const gotFirst = new Promise((done) => { gotFirstResolver = done; });
        const codecheckSub = omnisharp.events.filter(msg => msg.type === 'codecheck' && msg.sessionId === id).subscribe(msg => {
            const expectedCheck = cSharpDatabaseCodeCheckExpectedErrors[codechecks];
            if (isFirstCheck) {
                gotFirstResolver();
                isFirstCheck = false;
                check([done, codecheckSub], () => {
                    expect(msg.checks.length).to.equal(1);
                    expect(msg.checks[0].line).to.equal(expectedCheck.line, 'line');
                    expect(msg.checks[0].column).to.equal(expectedCheck.column, 'column');
                    expect(msg.checks[0].endLine).to.equal(expectedCheck.endLine, 'endLine');
                    expect(msg.checks[0].endColumn).to.equal(expectedCheck.endColumn, 'endColumn');
                    expect(msg.checks[0].logLevel).to.equal(expectedCheck.logLevel, 'logLevel');
                    expect(msg.checks[0].text).to.equal(expectedCheck.text, 'text');
                });
            } else {
                codecheckSub.unsubscribe();
                checkAndExit(done, () => {
                    expect(msg.checks.length).to.equal(0);
                });
            }
        });

        replaySteps([
            () => session.new(id, sqliteConnection),
            {
                for: firstEdits,
                fn: (evt) => editor.edit(id, evt)
            },
            () => session.codeCheck(id),
            {
                for: secondEdits,
                fn: (evt) => editor.edit(id, evt)
            },
            () => gotFirst.then(() => session.codeCheck(id))
        ]);
    });

    it('emits autocompletion messages for simple statement', function(done) {
        this.timeout(backendTimeout * 2);
        const completionSub = omnisharp.events.filter(msg => msg.type === 'autocompletion').subscribe(msg => {
            const items = msg.completions.map(x => x.CompletionText);
            Assert(cSharpAutocompletionExpectedValues[0].length > 0, 'Found no completion items');
            cSharpAutocompletionExpectedValues[0].forEach(expectedEntry => {
                expect(items).to.contain(expectedEntry, `Expected completion item "${expectedEntry}"`);
            });
            completionSub.unsubscribe();
            done();
        });
        const id = uuid.v4();
        replaySteps([
            () => session.new(id),
            {
                for: cSharpAutocompletionEditorTestData[0].events,
                fn: (evt) => editor.edit(id, evt)
            },
            () => session.autoComplete(id, cSharpAutocompletionRequestTestData[0])
        ]);
    });

    it('emits codecheck messages after switching buffer context', function(done) {
        this.timeout(backendTimeout * 3);
        sqliteConnection.id = 42;
        const id = uuid.v4();
        const firstEdits = cSharpContextSwitchEditorTestData[0].events.filter(x => x.time < 5000);
        const secondEdits = cSharpContextSwitchEditorTestData[0].events.filter(x => x.time >= 5000);
        const expectedCheck = cSharpContextSwitchExpectedCodeChecks[0];
        let codechecks = 0;
        const codecheckSub = omnisharp.events
            .filter(msg => msg.type === 'codecheck' && msg.sessionId === id)
            .subscribe(msg => {
                codechecks++;
                if (codechecks === 1) {
                    check([done, codecheckSub], () => {
                        expect(msg.checks.length).to.equal(1);
                        expect(msg.checks[0].text).to.equal(expectedCheck.text);
                        expect(msg.checks[0].logLevel).to.equal(expectedCheck.logLevel);
                    });
                } else {
                    codecheckSub.unsubscribe();
                    checkAndExit(done, () => {
                        expect(msg.checks.length).to.equal(0);
                    });
                }
            });

        // timing sensitive.
        replaySteps([
            100, () => session.new(id),
            {
                for: firstEdits, // yields text "city", which is illegal in code buffer
                wait: 100,
                fn: (evt) => editor.edit(id, evt)
            },
            500, () => session.codeCheck(id),
            // switch
            100, () => session.setContext(id, sqliteConnection),
            100, () => { },
            {
                for: secondEdits,
                wait: 100,
                fn: (evt) => editor.edit(id, evt)
            },
            500, () => session.codeCheck(id)
        ]);
    });

    it('stops query process when stopServer is called', function(done) {
        this.timeout(backendTimeout);
        query.once(msg => msg.type === 'closed', () => {
            let url = `http://localhost:${config.queryEnginePort}/checkreadystate`;
            http.get(url, res => { done(new Error('response received')); })
                .on('error', () => { done(); });
        });
        replaySteps([
            () => query.stopServer()
        ]);
    });

    it('stops omnisharp process when stopServer is called', function(done) {
        this.timeout(backendTimeout);
        omnisharp.once(msg => msg.type === 'closed', () => {
            let url = `http://localhost:${config.omnisharpPort}/checkreadystate`;
            http.get(url, res => { done(new Error('response received')); })
                .on('error', () => { done(); });
        });
        replaySteps([
            () => omnisharp.stopServer()
        ]);
    });
});

// Since "expect" throws inside a subscription handler, the stream crashes as a result.
// These helper functions aid in avoid crashing the suite

function check([done, subber], pred) {
    try {
        pred();
    } catch (exn) {
        console.log('CHECK ERROR', exn);
        subber.unsubscribe();
        done(exn);
    }
}

function checkAndExit(done, pred) {
    try {
        pred();
        done();
    } catch (exn) {
        console.log('CHECKANDEXIT ERROR', exn);
        done(exn);
    }
}
