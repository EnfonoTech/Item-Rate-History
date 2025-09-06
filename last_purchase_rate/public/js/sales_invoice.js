frappe.ui.form.on('Sales Invoice', {
    refresh: function (frm) {
      setTimeout(function () {
        add_price_history_button(frm);
      }, 1000);
    },
  
    items_add: function (frm, cdt, cdn) {
      setTimeout(function () {
        add_price_history_button(frm);
      }, 500);
    }
  });
  
  function add_price_history_button(frm) {
    if (frm.price_history_btn_added) return;
  
    let add_multiple_btn = frm.$wrapper.find('.btn-add-multiple, .btn-add-multiple-items, [data-label="Add Multiple"]');
  
    if (add_multiple_btn.length > 0) {
      let price_history_btn = $(`<button class="btn btn-default btn-sm" style="margin-left: 10px;">
        ${__('Show Price History')}
      </button>`);
  
      price_history_btn.on('click', function () {
        open_item_history_dialog(frm);
      });
  
      add_multiple_btn.after(price_history_btn);
      frm.price_history_btn_added = true;
    } else {
      let items_section = frm.$wrapper.find('[data-fieldname="items"]');
      if (items_section.length > 0) {
        let price_history_btn = $(`<button class="btn btn-default btn-sm" style="margin: 10px 0;">
          ${__('Show Price History')}
        </button>`);
  
        price_history_btn.on('click', function () {
          open_item_history_dialog(frm);
        });
  
        items_section.append(price_history_btn);
        frm.price_history_btn_added = true;
      }
    }
  }
  
  function open_item_history_dialog(frm, default_item_code) {
    // Always create a fresh dialog
    let d = new frappe.ui.Dialog({
      title: 'Item Sales & Purchase Price History',
      fields: [
        { fieldname: 'item_code', label: 'Item Code', fieldtype: 'Link', options: 'Item', default: default_item_code },
        { fieldname: 'results', fieldtype: 'HTML' }
      ],
      size: 'extra-large',
      primary_action_label: 'Close',
      primary_action: function () {
        d.hide();
      }
    });
  
    d.show();
  
    setTimeout(() => {
      // Bind using Frappe's built-in onchange for the Link field
      if (d.fields_dict.item_code) {
        d.fields_dict.item_code.df.onchange = function () {
          const item_code = d.get_value('item_code');
          if (item_code) {
            fetch_item_history(item_code, 20, d);
          }
        };
      }
  
      // Auto-fetch if dialog opened with default item
      if (default_item_code) {
        fetch_item_history(default_item_code, 20, d);
      }
    }, 200);
  }
  
  
  function fetch_item_history(item_code, limit, dialog) {
    dialog.fields_dict.results.$wrapper.html('<div class="text-muted">Loading…</div>');
  
    frappe.call({
      method: 'last_purchase_rate.api.get_item_sales_history',
      args: { item_code, limit },
      callback: function (r) {
        const rows = r.message || [];
        if (!rows.length) {
          dialog.fields_dict.results.$wrapper.html('<div class="text-muted">No history found.</div>');
          return;
        }
  
        dialog.fields_dict.results.$wrapper.html(render_history_table(rows));

        // enable invoice links
        dialog.fields_dict.results.$wrapper.find('[data-doctype][data-name]').on('click', function () {
          frappe.set_route('Form', this.getAttribute('data-doctype'), this.getAttribute('data-name'));
        });

        // re-init filters each time with proper timing and scope
        setTimeout(() => {
          setupTableFilters(dialog);
        }, 100);
      },
      error: function (err) {
        dialog.fields_dict.results.$wrapper.html('<div class="text-danger">Error fetching data: ' + err.message + '</div>');
      }
    });
  }
  
  function render_history_table(rows) {
    var out = [
      '<div class="mt-3">',
      '<table class="table table-bordered table-sm" id="price-history-table">',
      '<thead>',
      '<tr>',
      '<th>Item Code</th>',
      '<th>Item Name</th>',
      '<th>Customer</th>',
      '<th>Sales Rate (Txn)</th>',
      '<th>Qty</th>',
      '<th>Last Purchase Rate</th>',
      '</tr>',
      '<tr class="filter-row">',
      '<th><input type="text" class="form-control input-sm" placeholder="Filter Item Code"></th>',
      '<th><input type="text" class="form-control input-sm" placeholder="Filter Item Name"></th>',
      '<th><input type="text" class="form-control input-sm" placeholder="Filter Customer"></th>',
      '<th><input type="text" class="form-control input-sm" placeholder="Filter Sales Rate"></th>',
      '<th><input type="text" class="form-control input-sm" placeholder="Filter Qty"></th>',
      '<th><input type="text" class="form-control input-sm" placeholder="Filter Purchase Rate"></th>',
      '</tr>',
      '</thead>',
      '<tbody>'
    ].join('');
  
    rows.forEach(function (r) {
      var item_code = frappe.utils.escape_html(r.item_code || '');
      var item_name = frappe.utils.escape_html(r.item_name || '');
      var cust = frappe.utils.escape_html(r.customer || '');
      out += [
        '<tr>',
        `<td>${item_code}</td>`,
        `<td>${item_name}</td>`,
        `<td>${cust}</td>`,
        `<td class="text-right">${format_currency(r.sales_rate || 0, r.currency || '')}</td>`,
        `<td class="text-right">${format_number(r.qty || 0, null)}</td>`,
        `<td class="text-right">${format_currency(r.last_purchase_rate || 0, r.currency || '')}</td>`,
        '</tr>'
      ].join('');
    });
  
    out += '</tbody></table></div>';
    return out;
  }
  
  function setupTableFilters(dialog) {
    // Use dialog wrapper to scope the search
    const table = dialog.fields_dict.results.$wrapper.find('#price-history-table')[0];
    if (!table) return;

    const filterInputs = table.querySelectorAll('.filter-row input');
    const tbody = table.querySelector('tbody');
    if (!tbody || !filterInputs.length) return;

    // remove old handlers
    filterInputs.forEach(input => {
      if (input._filterHandler) {
        input.removeEventListener('input', input._filterHandler);
        delete input._filterHandler;
      }
    });

    // attach new ones
    filterInputs.forEach((input, index) => {
      input._filterHandler = function () {
        applyAllFilters(dialog);
      };
      input.addEventListener('input', input._filterHandler);
    });
  }
  
  function applyAllFilters(dialog) {
    // Use dialog wrapper to scope the search
    const table = dialog.fields_dict.results.$wrapper.find('#price-history-table')[0];
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');
    const filterInputs = table.querySelectorAll('.filter-row input');

    rows.forEach(row => {
      let shouldShow = true;

      filterInputs.forEach((input, j) => {
        const val = input.value.toLowerCase().trim();
        if (!val) return;

        const cell = row.cells[j];
        if (cell) {
          const cellText = (cell.textContent || '').toLowerCase();
          if (cellText.indexOf(val) === -1) {
            shouldShow = false;
          }
        }
      });

      row.style.display = shouldShow ? '' : 'none';
    });
  }
  