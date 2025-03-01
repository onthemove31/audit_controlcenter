angular.module('auditApp')
    .controller('AdminController', ['$scope', '$http', '$timeout', function($scope, $http, $timeout) {
    // Initialize allocation progress and stats
    $scope.allocationProgress = {
        percent: 0,
        current: 0,
        total: 0
    };
    $scope.auditorStats = [];
    
    // Initialize other admin state
    $scope.allocation = {
        inProgress: false,
        unallocatedCount: 0,
        progress: 0,
        message: ''
    };

    let allocationSource = null;

    function startRandomAllocation() {
        if (allocationSource) {
            allocationSource.close();
        }

        // Reset progress
        $scope.allocationProgress = { percent: 0, current: 0, total: 0 };
        $scope.auditorStats = [];
        $scope.allocation.inProgress = true;

        // Start progress monitoring using SSE
        allocationSource = new EventSource('/api/admin/allocation-progress');
        allocationSource.onmessage = function(event) {
            $scope.$evalAsync(() => {
                const progress = JSON.parse(event.data);
                $scope.allocationProgress = progress;
                $scope.allocation.progress = progress.percent;
            });
        };

        // Start allocation process
        $http.post('/api/admin/assign-random')
            .then(response => {
                console.log('Allocation complete:', response.data);
                $timeout(() => {
                    updateAuditorStats();
                    $scope.allocation.inProgress = false;
                    if (allocationSource) {
                        allocationSource.close();
                        allocationSource = null;
                    }
                });
            })
            .catch(error => {
                console.error('Allocation error:', error);
                $scope.allocation.inProgress = false;
                if (allocationSource) {
                    allocationSource.close();
                    allocationSource = null;
                }
            });
    }

    function updateAuditorStats() {
        console.log('Updating auditor stats...'); // Debug log
        $http.get('/api/admin/auditor-stats')
            .then(response => {
                console.log('Got stats response:', response.data); // Debug log
                $timeout(() => {
                    $scope.auditorStats = response.data;
                    $scope.$apply(); // Force update
                });
            })
            .catch(error => {
                console.error('Error fetching auditor stats:', error);
            });
    }

    // Function to start random allocation
    $scope.randomlyAssignWork = function() {
        $scope.allocation.inProgress = true;
        $scope.allocation.message = 'Starting allocation...';
        
        startRandomAllocation();
    };

    // Initialize data
    updateUnallocatedCount();
    updateAuditorStats();

    function updateUnallocatedCount() {
        $http.get('/api/admin/unallocated-count')
            .then(response => {
                $timeout(() => {
                    $scope.allocation.unallocatedCount = response.data.count;
                });
            });
    }

    // Update helper functions
    $scope.getTotalAllocated = function() {
        if (!$scope.auditorStats || !$scope.auditorStats.length) return 0;
        return $scope.auditorStats.reduce((sum, stat) => sum + (Number(stat.allocated) || 0), 0);
    };

    $scope.getTotalPending = function() {
        if (!$scope.auditorStats || !$scope.auditorStats.length) return 0;
        return $scope.auditorStats.reduce((sum, stat) => sum + (Number(stat.pending) || 0), 0);
    };

    $scope.getTotalCompleted = function() {
        if (!$scope.auditorStats || !$scope.auditorStats.length) return 0;
        return $scope.auditorStats.reduce((sum, stat) => sum + (Number(stat.completed) || 0), 0);
    };

    $scope.getOverallCompletionRate = function() {
        const total = $scope.getTotalAllocated();
        if (!total) return '0.0';
        const completed = $scope.getTotalCompleted();
        return ((completed / total) * 100).toFixed(1);
    };

    // Update the stats every 5 seconds
    const statsInterval = setInterval(updateAuditorStats, 5000);

    // Clean up when controller is destroyed
    $scope.$on('$destroy', function() {
        if (allocationSource) {
            allocationSource.close();
            allocationSource = null;
        }
        clearInterval(statsInterval);
    });
}]);
