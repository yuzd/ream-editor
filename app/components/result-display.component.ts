import { Component, Input, ElementRef } from '@angular/core';
import { QueryService } from '../services/query.service';
import { QueryResult } from '../models/query-result';
import { ResultPage } from '../models/result-page';

class ColumnSizing {
    width: number;
    column: number;
    fixed: boolean;
    userOffset: number;
}

@Component({
    selector: 'f-result-display',
    template: `
    <div class="result-display-component {{dragClass()}}" style="width: 100vw"
        (window:mousemove)="dragMove($event)"
        (window:mouseup)="dragEnd($event)">
        <div class="output-table-overview">
            <p class="pull-right">
                <em>{{result.loading ? 'Loading' : ''}}{{roundtripTime}}</em>
            </p>
            <div class="btn-group" role="group">
                <button 
                    *ngFor="let page of result.pages"
                    (click)="showResult(page)"
                    type="button" class="btn btn-default {{page.active ? 'active' : ''}}">
                    {{page.title}} 
                </button>
            </div>
        </div>
        <div *ngIf="activePage" class="output-table-header" [style.width]="outputWidth + 'px'" 
            [style.marginLeft]="(-1 * outputColumnOffset) + 'px'"
            style="overflow:hidden">
            <div [style.width]="columnWidth(0, true)">
                <div>&nbsp;</div>
                <div class="output-table-col-dragger"
                    (mousedown)="dragStart($event, 0)"></div>
            </div>
            <div *ngFor="let head of activePage.columns; let colIdx = index"
                [style.width]="columnWidth(colIdx + 1, true)"
                >
                    <div [innerText]="head"></div>
                    <div class="output-table-col-dragger"
                        (mousedown)="dragStart($event, colIdx + 1)"></div>
            </div>
        </div>
        <div *ngIf="activePage" class="output-table-rows" [style.height]="calcHeight()"
            (scroll)="updateColumns()">
            <div *ngFor="let row of activePage.rows; let rowIdx = index" [style.width]="outputWidth + 'px'">
                <div [style.width]="columnWidth(0)"><div>{{rowIdx + 1}}</div></div>
                <div *ngFor="let cell of row; let colIdx = index"
                    [style.width]="columnWidth(colIdx + 1)"
                    ><div [innerText]="cell"></div></div>
            </div>
        </div>
    </div>
`
})
export class ResultDisplayComponent {
    @Input() public result: QueryResult;
    private sizes: ColumnSizing[] = [];
    private availableWidth: number = null;
    
    // private columns: number[] = [];
    
    private dragColumns: number[] = [];
    private dragClientX: number;
    private dragging: number = null;
    private outputWidth: number = 0;
    private outputHeight = 0;
    private outputColumnOffset = 0;
    
    constructor(private query: QueryService) {
    }
    
    private showResult(page: ResultPage) {
        this.query.setActivePage(this.result.id, page.id);
    }
    
    private get activePage(): ResultPage {
        return this.result.pages.find(p => p.active);
    }
    
    private columnWidth(idx: number, isHeader: boolean): string {
        if (this.sizes[idx]) {
            let isLast = this.sizes.length - 1 === idx;
            return (this.sizes[idx].width - (isLast && !isHeader ? 17 : 1)) + 'px';
        }
        return '0';
    }
    
    private updateColumns() {
        let rowOverflower = document.querySelector('.output-table-rows');
        if (rowOverflower) {
            this.outputColumnOffset = rowOverflower.scrollLeft;
        }
    }
    
    private dragClass() {
        return this.dragging ? 'resizing-columns' : '';
    }
    
    ngAfterContentChecked() {
        let rowOverflower = document.querySelector('.output-table-rows');
        let container = document.querySelector('.result-display-container');
        if (rowOverflower) {
            let oldHeight = this.outputHeight;
            this.outputHeight = container.clientHeight -
                rowOverflower.parentElement.clientHeight;
            let oldWidth = this.availableWidth;
            let newWidth = container.clientWidth;
            let changed = oldHeight !== this.outputHeight || this.availableWidth !== newWidth;
            this.availableWidth = newWidth;
            if (changed) {
                // console.log('changed');
                if (this.sizes.length > 0) {
                    this.layoutResize(oldWidth, newWidth);
                } else {
                    this.layoutInitial();
                }
            }
            
        }
    }
    
    private dragMove(event) {
        if (this.dragging !== null && this.sizes[this.dragging]) {
            let delta = event.clientX - this.dragClientX;
            let newWidth = this.sizes[this.dragging].width + delta;
            this.sizes[this.dragging].width = newWidth < 30 ? 30 : newWidth;
            // adjust the next column, if possible
            if (this.dragging < this.sizes.length - 1) {
                let endCol = this.sizes[this.dragging + 1];
                // we only adjust if the column wasnt yet < 30, or we're growing the it
                if (endCol.width > 30 || delta < 0) {
                    endCol.width += (-1 * delta);
                }
            }
            this.updateTableWidth();
            // ensure we didnt shrink table too much
            if (this.outputWidth < this.availableWidth) {
                this.sizes[this.sizes.length - 1].width += (this.availableWidth - this.outputWidth);
            }
            this.updateTableWidth();
            Assert(this.outputWidth >= this.availableWidth, 'Did not fix total width');
            // for next delta
            this.dragClientX = event.clientX;
        }
    }
    
    private dragStart(event, idx: number) {
        this.dragging = idx;
        this.dragClientX = event.clientX;
    }
    
    private dragEnd(event) {
        this.dragging = null;
    }
    
    private layoutResize(from: number, to: number) {
        let delta = (to - from) / this.sizes.filter(x => !x.fixed).length;
        this.sizes.forEach(size => {
            if (!size.fixed) {
                size.width += delta;
            }
        });
        this.updateTableWidth();
    }
    
    // todo fakes font sizes in a crude way
    private layoutInitial(): void {
        let charSize = 13;
        let page = this.activePage;
        if (!page) {
            console.log('no page');
            return;
        }
        if (this.sizes.length === 0) {
            console.log('setting sizes');
            this.sizes = [<ColumnSizing> {
                fixed: true,
                width: page.rows.length.toString().length * charSize,
                column: 2 * charSize,
                userOffset: 0
            }].concat(page.columnTypes.map((colType, idx) => {
                let name = page.columns[idx];
                let fixed = ['string'].indexOf(colType.toLocaleLowerCase()) === -1;
                return <ColumnSizing> {
                    width: 0, // to be computed
                    column: name.length * charSize,
                    fixed,
                    userOffset: 0
                };
            }));
        }
        let fixedWidth = this.sizes.reduce((acc, size) => {
            return size.fixed ? (size.column + size.userOffset) : acc;
        }, 0);
        let avail = this.availableWidth - 17 - (this.sizes.filter(size => size.fixed).length) * 4; // paddings and scrollbar
        let availableFlex = (avail - fixedWidth) / (this.sizes.filter(size => !size.fixed).length);
        this.sizes.forEach((size, idx) => {
            if (size.fixed) {
                size.width = size.column + size.userOffset;
            } else {
                size.width = availableFlex + size.userOffset;
            }
        });
        this.updateTableWidth();
    }

    private get roundtripTime() {
        let ts = '';
        if (!this.result.loading) {
            let ticks = this.result.finished.getTime() - this.result.created.getTime();
            let unit = ticks < 1000 ? 'ms' : 'sec';
            let div = ticks < 1000 ? 1 : 1000;
            let fixed = ticks < 1000 ? 0 : 2;
            ts = `${(ticks / div).toFixed(fixed)} ${unit}.`;
        }
        return ts; 
    }

    private updateTableWidth() {
        this.outputWidth = this.sizes.reduce((acc, size) => {
            return acc + size.width;
        }, 0);
    }
    
    private calcHeight() {
        return this.outputHeight ? this.outputHeight + 'px' : '';
    }
}
