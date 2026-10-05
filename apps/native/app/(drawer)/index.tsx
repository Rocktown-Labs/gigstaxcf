import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Card, Chip, useThemeColor } from "heroui-native";
import { Text, View, Pressable, Alert } from "react-native";

import { Container } from "@/components/container";
import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { authClient } from "@/lib/auth-client";

import { ENV } from "../../src/env";

export default function Home() {
  const { data: session } = authClient.useSession();

  const openPolarLink = async (url: string, returnUrl: string) => {
    await WebBrowser.openAuthSessionAsync(url, returnUrl);
  };

  const getPolarReturnUrl = (returnUrl: string) => {
    const url = new URL("/polar/success", ENV.EXPO_PUBLIC_SERVER_URL);
    url.searchParams.set("returnUrl", returnUrl);
    return url.toString();
  };

  const handlePolarCheckout = async () => {
    const returnUrl = Linking.createURL("/");
    const polarReturnUrl = getPolarReturnUrl(returnUrl);
    const { data, error } = await authClient.checkout({
      slug: "pro",
      redirect: false,
      successUrl: polarReturnUrl,
      returnUrl: polarReturnUrl,
    });

    if (error || !data?.url) {
      Alert.alert("Checkout unavailable", error?.message ?? "Unable to create a checkout session.");
      return;
    }

    await openPolarLink(data.url, returnUrl);
  };

  const handlePolarPortal = async () => {
    const returnUrl = Linking.createURL("/");
    const { data, error } = await authClient.customer.portal({ redirect: false });

    if (error || !data?.url) {
      Alert.alert("Portal unavailable", error?.message ?? "Unable to open the customer portal.");
      return;
    }

    await openPolarLink(data.url, returnUrl);
  };

  const mutedColor = useThemeColor("muted");
  const successColor = useThemeColor("success");
  const dangerColor = useThemeColor("danger");
  const foregroundColor = useThemeColor("foreground");

  return (
    <Container className="p-6">
      <View className="py-4 mb-6">
        <Text className="text-4xl font-bold text-foreground mb-2">BETTER T STACK</Text>
      </View>

      {session?.user ? (
        <Card variant="secondary" className="mb-6 p-4">
          <Text className="text-foreground text-base mb-2">
            Welcome, <Text className="font-medium">{session.user.name}</Text>
          </Text>
          <Text className="text-muted text-sm mb-4">{session.user.email}</Text>
          <Pressable
            className="bg-danger py-3 px-4 rounded-lg self-start active:opacity-70"
            onPress={() => {
              authClient.signOut();
            }}
          >
            <Text className="text-foreground font-medium">Sign Out</Text>
          </Pressable>
          <View className="mt-4 gap-3">
            <Pressable
              className="bg-primary py-3 px-4 rounded-lg self-start active:opacity-70"
              onPress={handlePolarCheckout}
            >
              <Text className="text-foreground font-medium">Upgrade to Pro</Text>
            </Pressable>
            <Pressable
              className="border border-border py-3 px-4 rounded-lg self-start active:opacity-70"
              onPress={handlePolarPortal}
            >
              <Text className="text-foreground font-medium">Manage Subscription</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {!session?.user && (
        <>
          <SignIn />
          <SignUp />
        </>
      )}
    </Container>
  );
}
