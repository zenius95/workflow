// Dữ liệu mẫu
const rowData = [
  { make: "Tesla", model: "Model Y", price: 64950, electric: true },
  { make: "Ford", model: "F-Series", price: 33850, electric: false },
  { make: "Toyota", model: "Corolla", price: 29600, electric: false },
];

// Định nghĩa các cột ban đầu
const columnDefs = [
  { field: "make", headerName: "Hãng xe" },
  { 
        field: "add", 
        headerName: "",
        width: 60,
        sortable: false,
        resizable: false,
    },
];

// Biến để lưu trữ Grid API và Modal instance
let gridApi;
let addColumnModal;

/**
 * Thêm một nút nổi vào viewport của grid để tạo hàng mới.
 * Lưu ý: Nút này sẽ cuộn cùng với nội dung của bảng.
 */
function addPlusButtonToViewport() {

    if (document.getElementById('dynamicAddRowBtn')) return;

    const viewport = document.querySelector('.ag-body-viewport');

    console.log(viewport)

    if (!viewport) {
        setTimeout(addPlusButtonToViewport, 50); // Thử lại nếu viewport chưa sẵn sàng
        return;
    }

    const plusButton = document.createElement('button');
    plusButton.id = 'dynamicAddRowBtn';
    plusButton.className = 'btn btn-sm btn-outline-secondary p-0'; // Class cho nút nhỏ gọn
    plusButton.innerHTML = '+';
    plusButton.style.width = '22px';
    plusButton.style.height = '22px';


    plusButton.addEventListener('click', addNewRow);
    viewport.appendChild(plusButton);
}

/**
 * Thêm một hàng dữ liệu trống vào cuối bảng.
 */
function addNewRow() {
    if (!gridApi) return;
    
    const newRow = {}; // Tạo một object trống cho hàng mới
    const res = gridApi.applyTransaction({ add: [newRow] });

    // Cuộn đến hàng mới được thêm
    if (res.add && res.add.length > 0) {
        const newIndex = res.add[0].rowIndex;
        gridApi.ensureIndexVisible(newIndex, 'bottom');
    }
}

/**
 * Hàm này tìm header của cột cuối cùng và chèn một nút "+" vào đó.
 * Nó sẽ tự xóa nút cũ trước khi thêm nút mới để tránh trùng lặp.
 */
function addPlusButtonToLastHeader() {
    // Xóa nút cũ nếu tồn tại
    const existingButton = document.getElementById('dynamicAddColBtn');
    if (!existingButton) {

        // Tìm đến phần tử chứa text của header cuối cùng
        const lastHeaderLabel = document.querySelector('.ag-column-last .ag-header-cell-text');
        
        // Nếu không tìm thấy (grid có thể đang render), thử lại sau 50ms
        if (!lastHeaderLabel) {
            setTimeout(addPlusButtonToLastHeader, 50);
            return;
        }

        // Tạo nút "+" mới
        const plusButton = document.createElement('button');
        plusButton.id = 'dynamicAddColBtn';
        plusButton.className = 'btn btn-sm btn-outline-secondary p-0'; // Class cho nút nhỏ gọn
        plusButton.innerHTML = '+';
        plusButton.style.width = '22px';
        plusButton.style.height = '22px';
        plusButton.setAttribute('data-bs-toggle', 'modal');
        plusButton.setAttribute('data-bs-target', '#addColumnModal');

        // Gắn nút vào header và căn chỉnh bằng flex
        lastHeaderLabel.appendChild(plusButton);
        lastHeaderLabel.style.display = 'flex';
        lastHeaderLabel.style.alignItems = 'center';

    }
}


// Các tùy chọn cho AG Grid
const gridOptions = {
  rowData: rowData,
  columnDefs: columnDefs,
  onGridReady: (params) => {
    gridApi = params.api;

    setInterval(function() {
        addPlusButtonToLastHeader(); // Thêm nút khi grid được tải lần đầu
    }, 500)
  },
  // Đảm bảo nút được thêm lại nếu grid render lại dữ liệu
  onFirstDataRendered: () => {
    addPlusButtonToViewport();
  }
};

// Hàm để thêm cột mới (giữ nguyên)
function addColumn() {
    const columnNameInput = document.getElementById('columnName');
    const newColumnName = columnNameInput.value;

    if (newColumnName.trim() === '') {
        alert('Tên cột không được để trống');
        return;
    }
    if (!gridApi) return;

    const currentColumnDefs = gridApi.getColumnDefs();
    const newColDef = {
        headerName: newColumnName,
        field: newColumnName.toLowerCase().replace(/\s/g, ''),
        editable: true,
    };

    currentColumnDefs.splice((currentColumnDefs.length - 1), 0, newColDef);

    console.log(currentColumnDefs)

    gridApi.setGridOption('columnDefs', currentColumnDefs);

    // Thêm chức năng tự động cuộn đến cột mới
    setTimeout(() => {
        gridApi.ensureColumnVisible(newColDef.field, 'end');
    }, 100); // Thêm một độ trễ nhỏ để grid có thời gian render

    columnNameInput.value = '';
    if (addColumnModal) {
        addColumnModal.hide();
    }
}

// Khởi tạo AG Grid và Modal
document.addEventListener('DOMContentLoaded', () => {
    const gridDiv = document.querySelector('#myGrid');
    agGrid.createGrid(gridDiv, gridOptions);

    const modalElement = document.getElementById('addColumnModal');
    addColumnModal = new bootstrap.Modal(modalElement);

    document.getElementById('addColumnBtn').addEventListener('click', addColumn);
});
