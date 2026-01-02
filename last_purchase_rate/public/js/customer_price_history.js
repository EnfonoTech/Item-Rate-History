frappe.provide("grey_theme.test");

frappe.ui.form.on("Sales Invoice", {
    refresh(frm) {
        if (!frm.__price_assist_row_bound) {
            frm.fields_dict.items.grid.wrapper.on("click", ".grid-row", function () {
                const row_name = $(this).attr("data-name");
                if (!row_name) return;

                const row = locals["Sales Invoice Item"]?.[row_name];
                if (!row) return;

                if (frm.__price_assist_row && frm.__price_assist_row !== row) {
                    grey_theme.test.hide(frm.__price_assist_row);
                }

                frm.__price_assist_row = row;
            });
            frm.__price_assist_row_bound = true;
        }

        if (frm.__price_assist_btn_added) return;

        const btn = frm.fields_dict.items.grid.add_custom_button(__("Price Assist"), () => {
            const row = frm.__price_assist_row;

            if (!row) {
                frappe.msgprint("Please click an Item row first");
                return;
            }

            if (!frm.doc.customer || !row.item_code) {
                frappe.msgprint("Customer and Item Code are required");
                return;
            }

            grey_theme.test.show(frm, row);
        });

        frm.__price_assist_btn_added = true;

        setTimeout(() => {
            const $toolbar = frm.fields_dict.items.grid.wrapper.find(".grid-buttons");
            const $add_multiple = $toolbar.find("button:contains('Add Multiple')").last();
            if ($add_multiple.length && btn) {
                $(btn).insertAfter($add_multiple);
            }
        }, 0);
    }
});

frappe.ui.form.on("Sales Invoice Item", {
    rate(frm, cdt, cdn) {
        grey_theme.test.updateHighlight(locals[cdt][cdn]);
    },
    sales_invoice_item_remove(frm, cdt, cdn) {
        grey_theme.test.hide(locals[cdt]?.[cdn]);
    }
});

$.extend(grey_theme.test, {
    show(frm, row) {
        this.hide(row);
        frappe.call({
            method: "grey_theme.test.get_item_insights",
            args: {
                customer: frm.doc.customer,
                item_code: row.item_code,
                company: frm.doc.company,
                limit: 6,
                other_limit: 5
            },
            callback: r => {
                this.render(frm, row, r.message || {});
            }
        });
    },

    render(frm, row, insights) {
        this.hide(row);

        const price_history = insights.price_history || [];
        const other_customers = insights.other_customers || [];
        const stock = insights.stock || [];

        const avg_rate = flt(insights.avg_rate || 0);
        const last_rate = flt(insights.last_rate || 0);

        const id = `si-price-assist-${row.name}`;
        const $box = $(`<div class="si-price-assist" id="${id}"></div>`).appendTo("body");

        $box.append(`<div class="pa-customer">${frm.doc.customer}</div>`);
        $box.append(`<div class="pa-title">Price History: ${row.item_name || row.item_code}</div>`);

        const current_rate = flt(row.rate);
        let diff_text = "", diff_class = "";

        if (current_rate && last_rate) {
            const diff_pct = ((current_rate - last_rate) / last_rate) * 100;
            const abs = Math.abs(diff_pct);
            diff_class = abs <= 5 ? "pa-price-good" : abs <= 20 ? "pa-price-warn" : "pa-price-bad";
            diff_text = `${diff_pct >= 0 ? "+" : ""}${diff_pct.toFixed(1)}% vs last price`;
        }

        $box.append(`
            <div class="pa-summary ${diff_class}">
                <div class="pa-summary-main">
                    <div><label>Last</label><span>${last_rate || "-"}</span></div>
                    <div><label>Average</label><span>${avg_rate ? avg_rate.toFixed(2) : "-"}</span></div>
                    <div><label>Current</label><span>${current_rate || "-"}</span></div>
                </div>
                <div class="pa-summary-warning">${diff_text}</div>
            </div>
        `);

        price_history.forEach(d => {
            $box.append($(`
                <div class="pa-line">
                    <div class="pa-left">
                        <b>${d.rate}</b> (${d.currency}, ${d.uom})
                        <small>${d.qty} qty • ${frappe.format(d.posting_date, "Date")}</small>
                        <small class="pa-inv">
                            <a href="/app/sales-invoice/${encodeURIComponent(d.si)}" target="_blank">${d.si}</a>
                        </small>
                    </div>
                    <button class="pa-use">Use</button>
                </div>
            `).data("rate", d.rate));
        });

        if (other_customers.length) {
            $box.append(`<div class="pa-section-title">Other customers paying</div>`);
            other_customers.forEach(d => {
                $box.append($(`
                    <div class="pa-line pa-other">
                        <div class="pa-left">
                            <b>${d.rate}</b> (${d.currency}, ${d.uom})
                            <small>${d.customer}</small>
                        </div>
                        <button class="pa-use">Use</button>
                    </div>
                `).data("rate", d.rate));
            });
        }

        if (stock.length) {
            $box.append(`<div class="pa-section-title">Stock by Warehouse</div>`);
            const maxQty = Math.max(...stock.map(s => flt(s.projected_qty))) || 1;

            stock.forEach(s => {
                const fill = Math.min(100, (flt(s.projected_qty) / maxQty) * 100);
                $box.append(`
                    <div class="ps-line">
                        <div class="ps-left">
                            <b>${s.warehouse}</b>
                            <small>${s.projected_qty} available</small>
                        </div>
                        <div class="ps-bar-wrap">
                            <div class="ps-bar" style="width:${fill}%"></div>
                        </div>
                        <button class="ps-use">Use</button>
                    </div>
                `);
            });
        }

        const $input = $(`.grid-row[data-name="${row.name}"] input[data-fieldname="item_code"]`);
        if ($input.length) {
            const pos = $input.offset();
            $box.css({ top: pos.top + $input.outerHeight() + 8, left: pos.left });
        }

        $box.on("click", ".pa-use", function () {
            frappe.model.set_value(row.doctype, row.name, "rate", $(this).closest(".pa-line").data("rate"));
            grey_theme.test.hide(row);
        });

        $box.on("click", ".ps-use", function () {
            frappe.model.set_value(row.doctype, row.name, "warehouse", $(this).closest(".ps-line").find("b").text());
        });

        row._price_id = id;
    },

    updateHighlight(row) {
        if (!row || !row._price_id) return;
        const rate = flt(row.rate);
        $(`#${row._price_id} .pa-line`).each(function () {
            $(this).toggleClass("pa-match", flt($(this).data("rate")) === rate);
        });
    },

    hide(row) {
        if (row?._price_id) {
            $(`#${row._price_id}`).remove();
            delete row._price_id;
        }
    }
});

$(document).on("click.price_assist", function (e) {
    if ($(e.target).closest(".si-price-assist").length) return;
    if ($(e.target).closest(".grid-row").length) return;

    const frm = cur_frm;
    if (frm?.__price_assist_row) {
        grey_theme.test.hide(frm.__price_assist_row);
    }
});


$(`<style>
.si-price-assist{position:absolute;z-index:1050;width:340px;background:#0d1117;color:#fff;padding:14px;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,.45);font-size:13px}
.pa-customer{font-size:12px;color:#c9d1d9;margin-bottom:4px;opacity:.85}
.pa-title{font-weight:600;font-size:14px;margin-bottom:10px;opacity:.9}
.pa-summary{border-radius:10px;padding:10px;margin-bottom:10px;background:#111b24;border:1px solid rgba(255,255,255,.06)}
.pa-summary-main{display:flex;justify-content:space-between;gap:6px}
.pa-summary-main label{display:block;font-size:10px;text-transform:uppercase;opacity:.6}
.pa-summary-main span{font-size:13px;font-weight:600}
.pa-summary-warning{margin-top:6px;font-size:11px}
.pa-price-good{border-color:rgba(0,200,120,.4)}
.pa-price-good .pa-summary-warning{color:#00e676}
.pa-price-warn{border-color:rgba(255,200,0,.4)}
.pa-price-warn .pa-summary-warning{color:#ffeb3b}
.pa-price-bad{border-color:rgba(255,80,80,.5)}
.pa-price-bad .pa-summary-warning{color:#ff5252}
.pa-section-title{font-size:11px;text-transform:uppercase;opacity:.7;margin:6px 0 4px}
.pa-line{padding:10px;margin-bottom:8px;background:#111b24;border-radius:10px;display:flex;justify-content:space-between;align-items:center;border:1px solid rgba(255,255,255,.05)}
.pa-line:hover{background:#16212c}
.pa-line.pa-other{opacity:.85}
.pa-left b{font-size:14px;font-weight:600}
.pa-left small{display:block;font-size:10px;opacity:.75}
.pa-use{padding:6px 14px;font-size:11px;border-radius:8px;border:none;background:linear-gradient(90deg,#00d2ff,#3a7bd5);color:#fff;font-weight:600;cursor:pointer}
.ps-line{padding:8px;margin-bottom:6px;background:#101820;border-radius:10px;display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.06)}
.ps-left{min-width:120px}
.ps-left small{font-size:10px;opacity:.75}
.ps-bar-wrap{flex:1;height:6px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden}
.ps-bar{height:6px;border-radius:999px;background:linear-gradient(90deg,#00e676,#00b0ff)}
.ps-use{padding:4px 10px;font-size:10px;border-radius:999px;border:none;background:#263238;color:#e0f7fa;cursor:pointer}
</style>`).appendTo("head");
