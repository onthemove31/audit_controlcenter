function handleFileUpload() {
    const formData = new FormData();
    const fileInput = document.querySelector('#csvFile');
    formData.append('file', fileInput.files[0]);

    // Start progress monitoring
    const progressSource = new EventSource('/api/admin/upload-progress');
    progressSource.onmessage = function(event) {
        const progress = JSON.parse(event.data);
        updateProgressBar(progress.percent);
    };

    fetch('/api/admin/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        console.log('Upload complete:', data);
        progressSource.close();
        updateProgressBar(100);
    })
    .catch(error => {
        console.error('Upload error:', error);
        progressSource.close();
    });
}

function updateProgressBar(percent) {
    const progressBar = document.querySelector('.upload-progress-bar');
    if (progressBar) {
        progressBar.style.width = percent + '%';
        progressBar.textContent = percent + '%';
    }
}

let allocationSource = null;

function startRandomAllocation() {
    // Reset stats
    $scope.allocationProgress = { percent: 0, current: 0, total: 0 };
    $scope.auditorStats = [];

    // Start progress monitoring
    allocationSource = new EventSource('/api/admin/allocation-progress');
    allocationSource.onmessage = function(event) {
        const progress = JSON.parse(event.data);
        $scope.$apply(() => {
            $scope.allocationProgress = progress;
        });
    };

    // Start allocation and monitor stats
    fetch('/api/admin/assign-random', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        console.log('Allocation complete:', data);
        updateAuditorStats();
        if (allocationSource) {
            allocationSource.close();
        }
    })
    .catch(error => {
        console.error('Allocation error:', error);
        if (allocationSource) {
            allocationSource.close();
        }
    });
}

function updateAuditorStats() {
    fetch('/api/admin/auditor-stats')
    .then(response => response.json())
    .then(stats => {
        $scope.$apply(() => {
            $scope.auditorStats = stats;
        });
    });
}

// Clean up EventSource when leaving the page
$scope.$on('$destroy', function() {
    if (allocationSource) {
        allocationSource.close();
    }
});
