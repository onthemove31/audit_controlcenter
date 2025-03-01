angular.module('auditApp')
    .controller('LoginController', ['$scope', '$http', '$location', 
        function($scope, $http, $location) {
            
            $scope.login = function() {
                $http.post('/api/users/login', { username: $scope.username })
                    .then(function(response) {
                        localStorage.setItem('currentUser', JSON.stringify(response.data));
                        if (response.data.role === 'admin') {
                            $location.path('/admin');
                        } else {
                            $location.path('/audit');
                        }
                    })
                    .catch(function(error) {
                        $scope.error = error.data.error || 'Login failed';
                    });
            };
        }
    ]);
