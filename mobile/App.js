import React from "react"
import { StatusBar, useColorScheme } from "react-native"
import { NavigationContainer } from "@react-navigation/native"
import { createStackNavigator } from "@react-navigation/stack"
import { SafeAreaProvider } from "react-native-safe-area-context"

import HomeScreen   from "./src/screens/HomeScreen"
import ResultScreen from "./src/screens/ResultScreen"

const Stack = createStackNavigator()

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f13" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: "#1a1a22" },
            headerTintColor: "#e8e8f0",
            headerTitleStyle: { fontWeight: "700" },
            cardStyle: { backgroundColor: "#0f0f13" }
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: "purepic" }}
          />
          <Stack.Screen
            name="Result"
            component={ResultScreen}
            options={{ title: "stripped" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
