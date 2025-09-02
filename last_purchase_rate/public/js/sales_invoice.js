frappe.ui.form.on('Sales Invoice', {
  refresh: function (frm) {
    // Try to add button after Add Multiple button in Items section
    setTimeout(function() {
      add_price_history_button(frm);
    }, 1000);
    
    // Also add to Actions section as fallback
    frm.add_custom_button(__('Show Price History'), function () {
      open_item_history_dialog(frm);
    }, 'Actions');
  },
  
  items_add: function(frm, cdt, cdn) {
    // Add button when new item is added
    setTimeout(function() {
      add_price_history_button(frm);
    }, 500);
  }
});

function add_price_history_button(frm) {
  // Check if button already exists
  if (frm.price_history_btn_added) return;
  
  // Try to find the Add Multiple button and add our button in the same row
  let add_multiple_btn = frm.$wrapper.find('.btn-add-multiple, .btn-add-multiple-items, [data-label="Add Multiple"]');
  
  if (add_multiple_btn.length > 0) {
    let price_history_btn = $(`<button class="btn btn-default btn-sm" style="margin-left: 10px;">
      ${__('Show Price History')}
    </button>`);
    
    price_history_btn.on('click', function() {
      open_item_history_dialog(frm);
    });
    
    // Add the button in the same row as Add Multiple
    add_multiple_btn.after(price_history_btn);
    frm.price_history_btn_added = true;
  } else {
    // If we can't find the Add Multiple button, try to add it near the Items section
    let items_section = frm.$wrapper.find('[data-fieldname="items"]');
    if (items_section.length > 0) {
      let price_history_btn = $(`<button class="btn btn-default btn-sm" style="margin: 10px 0;">
        ${__('Show Price History')}
      </button>`);
      
      price_history_btn.on('click', function() {
        open_item_history_dialog(frm);
      });
      
      items_section.append(price_history_btn);
      frm.price_history_btn_added = true;
    }
  }
}

function open_item_history_dialog(frm, default_item_code) {
  const d = new frappe.ui.Dialog({
    title: 'Item Sales & Purchase Price History',
    fields: [
      { fieldname: 'item_code', label: 'Item Code', fieldtype: 'Link', options: 'Item', default: default_item_code },
      { fieldname: 'results', fieldtype: 'HTML' }
    ],
    size: 'extra-large',
    primary_action_label: 'Close',
    primary_action: function () { d.hide(); }
  });

  d.show();

  // Wait for dialog to be fully rendered, then bind events
  setTimeout(function() {
    console.log('Dialog fields:', d.fields_dict); // Debug log
    
    // Try multiple ways to bind the change event for item_code
    if (d.fields_dict.item_code && d.fields_dict.item_code.$input) {
      console.log('Binding change event to item_code field'); // Debug log
      
      // Method 1: Direct change event
      d.fields_dict.item_code.$input.on('change', function() {
        console.log('Change event triggered'); // Debug log
        const item_code = d.get_value('item_code');
        console.log('Item changed to:', item_code); // Debug log
        if (item_code) {
          fetch_item_history(item_code, 20, d);
        }
      });

      // Method 2: Also try input event
      d.fields_dict.item_code.$input.on('input', function() {
        console.log('Input event triggered'); // Debug log
        const item_code = d.get_value('item_code');
        if (item_code) {
          fetch_item_history(item_code, 20, d);
        }
      });

      // Method 3: Try the field's own change event
      d.fields_dict.item_code.df.onchange = function() {
        console.log('Field onchange triggered'); // Debug log
        const item_code = d.get_value('item_code');
        if (item_code) {
          fetch_item_history(item_code, 20, d);
        }
      };
    } else {
      console.log('item_code field not found or not accessible'); // Debug log
    }

    // Auto-fetch on dialog open if default item is set
    if (default_item_code) {
      console.log('Auto-fetching for default item:', default_item_code); // Debug log
      fetch_item_history(default_item_code, 20, d);
    }
  }, 200); // Increased timeout to 200ms
}

function fetch_item_history(item_code, limit, dialog) {
  console.log('Fetching history for item:', item_code, 'limit:', limit); // Debug log
  dialog.fields_dict.results.$wrapper.html('<div class="text-muted">Loading…</div>');

  const args = {
    item_code: item_code,
    limit: limit
  };

  // Call the Server Script API method
  frappe.call({
    method: 'last_purchase_rate.api.get_item_sales_history',
    args: args,
    callback: function (r) {
      console.log('API response:', r); // Debug log
      const rows = r.message || [];
      if (!rows.length) {
        dialog.fields_dict.results.$wrapper.html('<div class="text-muted">No history found.</div>');
        return;
      }
      dialog.fields_dict.results.$wrapper.html(render_history_table(rows));
      // Make invoice links openable
      dialog.fields_dict.results.$wrapper.find('[data-doctype][data-name]').on('click', function () {
        frappe.set_route('Form', this.getAttribute('data-doctype'), this.getAttribute('data-name'));
      });
    },
    error: function(err) {
      console.log('API error:', err); // Debug log
      dialog.fields_dict.results.$wrapper.html('<div class="text-danger">Error fetching data: ' + err.message + '</div>');
    }
  });
}

function render_history_table(rows) {
  var out = [
    '<div class="mt-3">',
    '<table class="table table-bordered table-sm">',
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
    '<th><input type="text" class="form-control input-sm" placeholder="Filter Item Code" onkeyup="filterTable(0, this.value)"></th>',
    '<th><input type="text" class="form-control input-sm" placeholder="Filter Item Name" onkeyup="filterTable(1, this.value)"></th>',
    '<th><input type="text" class="form-control input-sm" placeholder="Filter Customer" onkeyup="filterTable(2, this.value)"></th>',
    '<th><input type="text" class="form-control input-sm" placeholder="Filter Sales Rate" onkeyup="filterTable(3, this.value)"></th>',
    '<th><input type="text" class="form-control input-sm" placeholder="Filter Qty" onkeyup="filterTable(4, this.value)"></th>',
    '<th><input type="text" class="form-control input-sm" placeholder="Filter Purchase Rate" onkeyup="filterTable(5, this.value)"></th>',
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

// Add global filter function
window.filterTable = function(columnIndex, filterValue) {
  const table = document.querySelector('.table tbody');
  const rows = table.getElementsByTagName('tr');
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cell = row.getElementsByTagName('td')[columnIndex];
    
    if (cell) {
      const text = cell.textContent || cell.innerText;
      if (text.toLowerCase().indexOf(filterValue.toLowerCase()) > -1) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    }
  }
};
