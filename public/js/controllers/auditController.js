angular.module('auditApp')
    .controller('AuditController', ['$scope', '$http', '$location', '$timeout', function($scope, $http, $location, $timeout) {
        console.log('Initializing AuditController'); // Debug log

        // Initialize current user
        try {
            const storedUser = localStorage.getItem('currentUser');
            console.log('Stored user:', storedUser); // Debug log

            if (!storedUser) {
                console.log('No user found, redirecting to login'); // Debug log
                $location.path('/login');
                return;
            }

            $scope.currentUser = JSON.parse(storedUser);
            console.log('Current user:', $scope.currentUser); // Debug log
        } catch (error) {
            console.error('Error initializing user:', error);
            $location.path('/login');
            return;
        }

        // Initialize scope variables
        $scope.stats = {
            total: 0,
            completed: 0,
            pending: 0
        };
        
        $scope.currentPage = 1;
        $scope.totalPages = 1;
        $scope.currentRecords = [];

        function loadAuditorStats() {
            console.log('Loading stats for:', $scope.currentUser.username); // Debug log
            
            $http.get('/api/records/stats', { 
                params: { auditor: $scope.currentUser.username } 
            })
            .then(function(response) {
                console.log('Stats response:', response.data); // Debug log
                $timeout(() => {
                    $scope.stats = response.data;
                });
            })
            .catch(function(error) {
                console.error('Error loading stats:', error);
            });
        }

        function loadRecords(page) {
            console.log('Loading records for page:', page); // Debug log
            
            $http.get('/api/records', {
                params: {
                    auditor: $scope.currentUser.username,
                    page: page
                }
            })
            .then(function(response) {
                console.log('Records response:', response.data); // Debug log
                $timeout(() => {
                    $scope.currentRecords = response.data;
                });
            })
            .catch(function(error) {
                console.error('Error loading records:', error);
            });
        }

        // Initialize data
        loadAuditorStats();
        loadRecords($scope.currentPage);

        // Pagination functions
        $scope.nextPage = function() {
            if ($scope.currentPage < $scope.totalPages) {
                $scope.currentPage++;
                loadRecords($scope.currentPage);
            }
        };

        $scope.previousPage = function() {
            if ($scope.currentPage > 1) {
                $scope.currentPage--;
                loadRecords($scope.currentPage);
            }
        };

        // Refresh data periodically
        const refreshInterval = setInterval(() => {
            loadAuditorStats();
        }, 30000); // every 30 seconds

        // Cleanup on controller destruction
        $scope.$on('$destroy', function() {
            clearInterval(refreshInterval);
        });

        // Add logout function
        $scope.logout = function() {
            localStorage.removeItem('currentUser');
            $location.path('/login');
        };
    }]);
